"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import {
  checkSlotAvailability,
  computeBookingDeposit,
  estimateWaitlistMinutes,
  generateBookingCode,
  parseOutletFloorTables,
} from "@/lib/bookings";
import { POS_ROLES } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTimeZone, startOfDay } from "@/lib/time";
import { isUuid } from "@/lib/utils";
import type { BookingStatus, DepositStatus, TableBooking } from "@/lib/types";

type BookingResult =
  | { ok: true; booking: TableBooking; tableCode?: string | null }
  | { ok: false; error: string };

type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateBookingSurfaces(slug: string) {
  revalidatePath(`/r/${slug}/admin/bookings`);
  revalidatePath(`/r/${slug}/admin/tables`);
  revalidatePath(`/r/${slug}/pos`);
  revalidatePath(`/r/${slug}/book`);
}

export async function createStaffBookingAction(
  slug: string,
  input: {
    outletId: string;
    bookingType: "reservation" | "waitlist";
    source?: "admin" | "pos" | "phone" | "walk_in";
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    partySize: number;
    preferredZone?: string;
    occasion?: string;
    specialRequests?: string;
    reservedForIso?: string;
    durationMinutes?: number;
    tableId?: string | null;
    waiveDeposit?: boolean;
  },
): Promise<BookingResult> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(POS_ROLES, { restaurantId: restaurant.id });

  if (!isUuid(input.outletId)) {
    return { ok: false, error: "Invalid outlet selected." };
  }

  const customerName = input.customerName.trim();
  const customerPhone = input.customerPhone.trim();
  const partySize = Math.floor(Number(input.partySize) || 0);
  if (!customerName) return { ok: false, error: "Enter guest name." };
  if (customerPhone.replace(/[^\d]/g, "").length < 7) {
    return { ok: false, error: "Enter a valid guest phone number." };
  }
  if (partySize < 1 || partySize > 200) {
    return { ok: false, error: "Enter a valid party size." };
  }

  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("*")
    .eq("id", input.outletId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!outlet) return { ok: false, error: "Outlet not found." };

  const tz = resolveTimeZone(outlet.timezone);
  const now = new Date();
  const nowMs = now.getTime();

  if (input.bookingType === "waitlist") {
    const dayStart = startOfDay(now, tz);
    const [{ data: tabsData }, { data: todayWaitlist }] = await Promise.all([
      admin.from("pos_tabs").select("id, name").eq("outlet_id", outlet.id),
      admin
        .from("table_bookings")
        .select("id, status, queue_number")
        .eq("outlet_id", outlet.id)
        .eq("booking_type", "waitlist")
        .gte("created_at", dayStart.toISOString()),
    ]);

    const tables = parseOutletFloorTables(tabsData ?? []);
    const activeAhead = (todayWaitlist ?? []).filter(
      (b) => b.status === "waitlisted" || b.status === "notified",
    ).length;
    const maxQueue = (todayWaitlist ?? []).reduce(
      (m, b) => Math.max(m, Number(b.queue_number ?? 0)),
      0,
    );

    const { data: created, error } = await admin
      .from("table_bookings")
      .insert({
        restaurant_id: restaurant.id,
        outlet_id: outlet.id,
        table_id:
          input.tableId && isUuid(input.tableId) ? input.tableId : null,
        booking_code: generateBookingCode("waitlist"),
        booking_type: "waitlist",
        source: input.source ?? "walk_in",
        status: "waitlisted",
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: input.customerEmail?.trim() || null,
        party_size: partySize,
        preferred_zone: input.preferredZone?.trim() || null,
        occasion: input.occasion?.trim() || null,
        special_requests: input.specialRequests?.trim() || null,
        reserved_for: now.toISOString(),
        duration_minutes: outlet.booking_turn_minutes ?? 90,
        quoted_wait_minutes: estimateWaitlistMinutes({
          activeWaitlistCount: activeAhead,
          partySize,
          totalTablesCount: tables.length,
        }),
        queue_number: maxQueue + 1,
        deposit_amount: 0,
        deposit_status: "none",
      })
      .select("*")
      .single();

    if (error || !created) {
      return { ok: false, error: error?.message ?? "Failed to add waitlist party." };
    }
    revalidateBookingSurfaces(slug);
    return { ok: true, booking: created as TableBooking };
  }

  // Scheduled reservation
  const reservedMs = input.reservedForIso
    ? new Date(input.reservedForIso).getTime()
    : Number.NaN;
  if (!Number.isFinite(reservedMs)) {
    return { ok: false, error: "Select a valid date & time." };
  }
  const durationMinutes = Math.min(
    480,
    Math.max(15, Math.floor(Number(input.durationMinutes ?? outlet.booking_turn_minutes ?? 90))),
  );

  const windowStart = new Date(reservedMs - 12 * 60 * 60_000).toISOString();
  const windowEnd = new Date(reservedMs + 12 * 60 * 60_000).toISOString();

  const [{ data: tabsData }, { data: nearBookings }] = await Promise.all([
    admin.from("pos_tabs").select("id, name").eq("outlet_id", outlet.id),
    admin
      .from("table_bookings")
      .select("*")
      .eq("outlet_id", outlet.id)
      .gte("reserved_for", windowStart)
      .lte("reserved_for", windowEnd),
  ]);

  const tables = parseOutletFloorTables(tabsData ?? []);
  const specificTableId =
    input.tableId && isUuid(input.tableId) ? input.tableId : null;

  const avail = checkSlotAvailability({
    tables,
    bookings: nearBookings ?? [],
    slotStartMs: reservedMs,
    durationMinutes,
    partySize,
    preferredZone: input.preferredZone?.trim() || null,
    specificTableId,
    nowMs,
  });

  if (!avail.available) {
    return { ok: false, error: avail.reason ?? "Slot is unavailable." };
  }

  const computedDeposit = computeBookingDeposit(
    partySize,
    Number(outlet.booking_deposit_per_guest ?? 0),
    Number(outlet.booking_deposit_min_party ?? 1),
  );
  const waived = Boolean(input.waiveDeposit);
  const depositAmount = waived ? 0 : computedDeposit;

  const { data: created, error } = await admin
    .from("table_bookings")
    .insert({
      restaurant_id: restaurant.id,
      outlet_id: outlet.id,
      table_id: avail.suggestedTableId,
      booking_code: generateBookingCode("reservation"),
      booking_type: "reservation",
      source: input.source ?? "phone",
      status: "confirmed",
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: input.customerEmail?.trim() || null,
      party_size: partySize,
      preferred_zone: input.preferredZone?.trim() || null,
      occasion: input.occasion?.trim() || null,
      special_requests: input.specialRequests?.trim() || null,
      reserved_for: new Date(reservedMs).toISOString(),
      duration_minutes: durationMinutes,
      deposit_amount: depositAmount,
      deposit_status:
        computedDeposit > 0 && waived
          ? "waived"
          : depositAmount > 0
            ? "pending"
            : "none",
    })
    .select("*")
    .single();

  if (error || !created) {
    return { ok: false, error: error?.message ?? "Failed to save booking." };
  }

  const assignedTable = tables.find((t) => t.id === created.table_id);
  revalidateBookingSurfaces(slug);
  return {
    ok: true,
    booking: created as TableBooking,
    tableCode: assignedTable?.code ?? null,
  };
}

export async function assignBookingTableAction(
  slug: string,
  bookingId: string,
  tableId: string | null,
): Promise<BookingResult> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(POS_ROLES, { restaurantId: restaurant.id });

  if (!isUuid(bookingId)) return { ok: false, error: "Booking not found." };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("table_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!booking) return { ok: false, error: "Booking not found." };

  let assignedCode: string | null = null;
  if (tableId) {
    if (!isUuid(tableId)) return { ok: false, error: "Invalid table." };
    const slotMs = new Date(booking.reserved_for).getTime();
    const [{ data: tabsData }, { data: nearBookings }] = await Promise.all([
      admin.from("pos_tabs").select("id, name").eq("outlet_id", booking.outlet_id),
      admin
        .from("table_bookings")
        .select("*")
        .eq("outlet_id", booking.outlet_id)
        .gte("reserved_for", new Date(slotMs - 12 * 60 * 60_000).toISOString())
        .lte("reserved_for", new Date(slotMs + 12 * 60 * 60_000).toISOString()),
    ]);

    const tables = parseOutletFloorTables(tabsData ?? []);
    const avail = checkSlotAvailability({
      tables,
      bookings: nearBookings ?? [],
      slotStartMs: slotMs,
      durationMinutes: booking.duration_minutes,
      partySize: booking.party_size,
      specificTableId: tableId,
      excludeBookingId: booking.id,
    });
    if (!avail.available) {
      return { ok: false, error: avail.reason ?? "Table is not free at that time." };
    }
    assignedCode = tables.find((t) => t.id === tableId)?.code ?? null;
  }

  const { data: updated, error } = await admin
    .from("table_bookings")
    .update({ table_id: tableId })
    .eq("id", bookingId)
    .eq("restaurant_id", restaurant.id)
    .select("*")
    .single();
  if (error || !updated) {
    return { ok: false, error: error?.message ?? "Failed to assign table." };
  }

  revalidateBookingSurfaces(slug);
  return { ok: true, booking: updated as TableBooking, tableCode: assignedCode };
}

export async function updateBookingStatusAction(
  slug: string,
  bookingId: string,
  nextStatus: BookingStatus,
  cancelReason?: string,
): Promise<BookingResult> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(POS_ROLES, { restaurantId: restaurant.id });

  if (!isUuid(bookingId)) return { ok: false, error: "Booking not found." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("table_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Booking not found." };

  const nowIso = new Date().toISOString();
  const patch: Partial<TableBooking> = { status: nextStatus };
  if (nextStatus === "seated" && !existing.seated_at) patch.seated_at = nowIso;
  if (nextStatus === "completed" && !existing.completed_at) {
    patch.completed_at = nowIso;
  }
  if (nextStatus === "cancelled") {
    patch.cancelled_at = nowIso;
    patch.cancel_reason = cancelReason?.trim() || "Cancelled by host desk";
  }

  const { data: updated, error } = await admin
    .from("table_bookings")
    .update(patch)
    .eq("id", bookingId)
    .eq("restaurant_id", restaurant.id)
    .select("*")
    .single();
  if (error || !updated) {
    return { ok: false, error: error?.message ?? "Failed to update booking." };
  }

  revalidateBookingSurfaces(slug);
  return { ok: true, booking: updated as TableBooking };
}

export async function seatBookingInPosAction(
  slug: string,
  bookingId: string,
  preferredTableId?: string | null,
): Promise<BookingResult> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(POS_ROLES, { restaurantId: restaurant.id });

  if (!isUuid(bookingId)) return { ok: false, error: "Booking not found." };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("table_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!booking) return { ok: false, error: "Booking not found." };

  const { data: tabsData } = await admin
    .from("pos_tabs")
    .select("id, name")
    .eq("outlet_id", booking.outlet_id)
    .order("name");
  const tables = parseOutletFloorTables(tabsData ?? []);

  let resolvedTableId =
    preferredTableId && isUuid(preferredTableId)
      ? preferredTableId
      : booking.table_id;

  if (resolvedTableId && !tables.some((t) => t.id === resolvedTableId)) {
    resolvedTableId = null;
  }

  if (!resolvedTableId && tables.length > 0) {
    const slotMs = Date.now();
    const { data: nearBookings } = await admin
      .from("table_bookings")
      .select("*")
      .eq("outlet_id", booking.outlet_id)
      .gte("reserved_for", new Date(slotMs - 6 * 60 * 60_000).toISOString())
      .lte("reserved_for", new Date(slotMs + 6 * 60 * 60_000).toISOString());
    const match = checkSlotAvailability({
      tables,
      bookings: nearBookings ?? [],
      slotStartMs: slotMs,
      durationMinutes: booking.duration_minutes,
      partySize: booking.party_size,
      preferredZone: booking.preferred_zone,
      excludeBookingId: booking.id,
    });
    resolvedTableId = match.suggestedTableId ?? tables[0].id;
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("table_bookings")
    .update({
      status: "seated",
      seated_at: booking.seated_at ?? nowIso,
      table_id: resolvedTableId ?? null,
    })
    .eq("id", booking.id)
    .eq("restaurant_id", restaurant.id)
    .select("*")
    .single();
  if (error || !updated) {
    return { ok: false, error: error?.message ?? "Failed to seat booking." };
  }

  const tableCode = tables.find((t) => t.id === updated.table_id)?.code ?? null;
  revalidateBookingSurfaces(slug);
  return { ok: true, booking: updated as TableBooking, tableCode };
}

export async function updateBookingDepositStatusAction(
  slug: string,
  bookingId: string,
  depositStatus: DepositStatus,
): Promise<BookingResult> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  if (!isUuid(bookingId)) return { ok: false, error: "Booking not found." };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("table_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!booking) return { ok: false, error: "Booking not found." };

  const shouldConfirm =
    (depositStatus === "paid" || depositStatus === "waived") &&
    (booking.status === "pending_payment" || booking.status === "pending");

  const { data: updated, error } = await admin
    .from("table_bookings")
    .update({
      deposit_status: depositStatus,
      ...(shouldConfirm ? { status: "confirmed" } : {}),
      ...(depositStatus === "waived" ? { deposit_amount: 0 } : {}),
    })
    .eq("id", bookingId)
    .eq("restaurant_id", restaurant.id)
    .select("*")
    .single();

  if (error || !updated) {
    return { ok: false, error: error?.message ?? "Failed to update deposit." };
  }

  revalidateBookingSurfaces(slug);
  return { ok: true, booking: updated as TableBooking };
}

export async function saveOutletBookingPolicyAction(
  slug: string,
  input: {
    outletId: string;
    bookingsEnabled: boolean;
    slotMinutes: number;
    turnMinutes: number;
    maxPartySize: number;
    advanceDays: number;
    depositPerGuest: number;
    depositMinParty: number;
  },
): Promise<ActionResult> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  if (!isUuid(input.outletId)) return { ok: false, error: "Invalid outlet." };

  const slotMinutes = [15, 30, 60].includes(Number(input.slotMinutes))
    ? Number(input.slotMinutes)
    : 30;
  const turnMinutes = Math.min(360, Math.max(30, Math.round(input.turnMinutes || 90)));
  const maxPartySize = Math.min(200, Math.max(1, Math.round(input.maxPartySize || 20)));
  const advanceDays = Math.min(180, Math.max(1, Math.round(input.advanceDays || 30)));
  const depositPerGuest = Math.max(0, Math.round((Number(input.depositPerGuest) || 0) * 100) / 100);
  const depositMinParty = Math.max(1, Math.round(Number(input.depositMinParty) || 1));

  const admin = createAdminClient();
  const { error } = await admin
    .from("outlets")
    .update({
      bookings_enabled: Boolean(input.bookingsEnabled),
      booking_slot_minutes: slotMinutes,
      booking_turn_minutes: turnMinutes,
      booking_max_party_size: maxPartySize,
      booking_advance_days: advanceDays,
      booking_deposit_per_guest: depositPerGuest,
      booking_deposit_min_party: depositMinParty,
    })
    .eq("id", input.outletId)
    .eq("restaurant_id", restaurant.id);

  if (error) return { ok: false, error: error.message };
  revalidateBookingSurfaces(slug);
  return { ok: true };
}
