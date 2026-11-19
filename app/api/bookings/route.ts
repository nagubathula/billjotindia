import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import {
  authenticateApiKeyAnyScope,
  keyCoversOutlet,
  presentedApiKey,
  type ApiKeyContext,
} from "@/lib/api-keys";
import {
  checkSlotAvailability,
  computeBookingDeposit,
  estimateWaitlistMinutes,
  generateAvailableSlotsForDate,
  generateBookingCode,
  parseOutletFloorTables,
} from "@/lib/bookings";
import { isOutletOpen } from "@/lib/opening-hours";
import { getPublicPaymentConfig } from "@/lib/payments";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, resolveTimeZone, startOfDay } from "@/lib/time";
import { isUuid } from "@/lib/utils";
import type { Outlet } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "GET, POST, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

async function resolveOutletScope(params: {
  admin: ReturnType<typeof createAdminClient>;
  apiKey: ApiKeyContext | null;
  outletIdParam?: string | null;
  slugParam?: string | null;
}): Promise<
  | { ok: true; outlet: Outlet; restaurantName: string; restaurantSlug: string }
  | { ok: false; status: number; error: string }
> {
  const { admin, apiKey, outletIdParam, slugParam } = params;

  if (outletIdParam && isUuid(outletIdParam)) {
    const { data: outlet } = await admin
      .from("outlets")
      .select("*")
      .eq("id", outletIdParam)
      .eq("status", "active")
      .maybeSingle();
    if (!outlet) return { ok: false, status: 404, error: "Outlet not found" };
    if (apiKey && !keyCoversOutlet(apiKey, outlet)) {
      return {
        ok: false,
        status: 403,
        error: "This API key cannot access that outlet",
      };
    }
    const { data: rest } = await admin
      .from("restaurants")
      .select("name, slug")
      .eq("id", outlet.restaurant_id)
      .maybeSingle();
    return {
      ok: true,
      outlet: outlet as Outlet,
      restaurantName: rest?.name ?? "Restaurant",
      restaurantSlug: rest?.slug ?? "",
    };
  }

  if (apiKey) {
    let query = admin
      .from("outlets")
      .select("*")
      .eq("restaurant_id", apiKey.restaurantId)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (apiKey.outletId) query = query.eq("id", apiKey.outletId);
    const { data: list } = await query;
    const outlet = list?.[0];
    if (!outlet) return { ok: false, status: 404, error: "No active outlet found" };
    const { data: rest } = await admin
      .from("restaurants")
      .select("name, slug")
      .eq("id", apiKey.restaurantId)
      .maybeSingle();
    return {
      ok: true,
      outlet: outlet as Outlet,
      restaurantName: rest?.name ?? "Restaurant",
      restaurantSlug: rest?.slug ?? "",
    };
  }

  if (slugParam?.trim()) {
    const { data: rest } = await admin
      .from("restaurants")
      .select("id, name, slug")
      .eq("slug", slugParam.trim())
      .eq("status", "active")
      .maybeSingle();
    if (!rest) return { ok: false, status: 404, error: "Restaurant not found" };
    const { data: outletList } = await admin
      .from("outlets")
      .select("*")
      .eq("restaurant_id", rest.id)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    const outlet = outletList?.[0];
    if (!outlet) return { ok: false, status: 404, error: "No active outlet found" };
    return {
      ok: true,
      outlet: outlet as Outlet,
      restaurantName: rest.name,
      restaurantSlug: rest.slug,
    };
  }

  return {
    ok: false,
    status: 400,
    error: "Provide outlet_id or restaurant_slug (or authenticate with an API key)",
  };
}

function sanitizePublicBooking(row: {
  id: string;
  booking_code: string;
  booking_type: string;
  status: string;
  customer_name: string;
  party_size: number;
  preferred_zone: string | null;
  occasion: string | null;
  reserved_for: string;
  duration_minutes: number;
  quoted_wait_minutes: number | null;
  queue_number: number | null;
  deposit_amount: number;
  deposit_status: string;
  outlet_id: string;
  table_id: string | null;
}) {
  return {
    id: row.id,
    booking_code: row.booking_code,
    booking_type: row.booking_type,
    status: row.status,
    customer_name: row.customer_name,
    party_size: row.party_size,
    preferred_zone: row.preferred_zone,
    occasion: row.occasion,
    reserved_for: row.reserved_for,
    duration_minutes: row.duration_minutes,
    quoted_wait_minutes: row.quoted_wait_minutes,
    queue_number: row.queue_number,
    deposit_amount: Number(row.deposit_amount ?? 0),
    deposit_status: row.deposit_status,
    outlet_id: row.outlet_id,
    table_id: row.table_id,
  };
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "GET, POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `bookings-get:ip:${ip}`,
    limit: 120,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }

  let apiKey: ApiKeyContext | null = null;
  if (presentedApiKey(request)) {
    const check = await authenticateApiKeyAnyScope(request, [
      "bookings:read",
      "menu:read",
    ]);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: check.status, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
      );
    }
    apiKey = check.key;
    cors = apiCorsHeaders(
      origin,
      "GET, POST, OPTIONS",
      apiKey.allowedOrigins,
      request.url,
    );
  }
  cors = { ...cors, ...rateLimitHeaders(ipLimit) };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  const url = new URL(request.url);
  const admin = createAdminClient();
  const resolved = await resolveOutletScope({
    admin,
    apiKey,
    outletIdParam: url.searchParams.get("outlet_id"),
    slugParam: url.searchParams.get("restaurant_slug"),
  });
  if (!resolved.ok) return fail(resolved.status, resolved.error);

  const { outlet, restaurantName, restaurantSlug } = resolved;
  const tz = resolveTimeZone(outlet.timezone);

  // Lookup by booking code (with last-4 phone verification when unauthenticated)
  const codeParam = url.searchParams.get("code")?.trim().toUpperCase();
  if (codeParam) {
    const { data: booking } = await admin
      .from("table_bookings")
      .select("*")
      .eq("outlet_id", outlet.id)
      .eq("booking_code", codeParam)
      .maybeSingle();
    if (!booking) return fail(404, "Booking not found");

    if (!apiKey) {
      const phoneParam = (url.searchParams.get("phone") ?? "").replace(/[^\d]/g, "");
      const actualPhone = booking.customer_phone.replace(/[^\d]/g, "");
      if (phoneParam.length < 4 || actualPhone.slice(-4) !== phoneParam.slice(-4)) {
        return fail(403, "Enter the last 4 digits of the phone number used to book");
      }
    }

    return NextResponse.json(
      { booking: sanitizePublicBooking(booking) },
      { headers: cors },
    );
  }

  const now = new Date();
  const dateParam = url.searchParams.get("date")?.trim();
  const dateStr =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : dayKey(now, tz);
  const partySize = Math.min(
    outlet.booking_max_party_size,
    Math.max(1, Math.floor(Number(url.searchParams.get("party_size") ?? 2) || 2)),
  );
  const zoneParam = url.searchParams.get("zone")?.trim() || null;

  const dayStart = startOfDay(now, tz);
  const windowStart = new Date(
    Math.min(dayStart.getTime(), new Date(`${dateStr}T00:00:00Z`).getTime() - 24 * 60 * 60_000),
  );
  const windowEnd = new Date(
    new Date(`${dateStr}T00:00:00Z`).getTime() + 48 * 60 * 60_000,
  );

  const [{ data: tabsData }, { data: bookingsData }, payCfg] = await Promise.all([
    admin.from("pos_tabs").select("id, name").eq("outlet_id", outlet.id),
    admin
      .from("table_bookings")
      .select("*")
      .eq("outlet_id", outlet.id)
      .gte("reserved_for", windowStart.toISOString())
      .lte("reserved_for", windowEnd.toISOString()),
    getPublicPaymentConfig(outlet.id),
  ]);

  const tables = parseOutletFloorTables(tabsData ?? []);
  const zones = [...new Set(tables.map((t) => t.zone))].sort();
  const bookings = bookingsData ?? [];

  const waitingToday = bookings.filter(
    (b) =>
      b.booking_type === "waitlist" &&
      (b.status === "waitlisted" || b.status === "notified") &&
      new Date(b.created_at).getTime() >= dayStart.getTime(),
  ).length;

  const slots = outlet.bookings_enabled
    ? generateAvailableSlotsForDate({
        dateStr,
        timeZone: tz,
        openingHours: outlet.opening_hours,
        slotMinutes: outlet.booking_slot_minutes,
        turnMinutes: outlet.booking_turn_minutes,
        partySize,
        preferredZone: zoneParam,
        tables,
        bookings,
        nowMs: now.getTime(),
      })
    : [];

  return NextResponse.json(
    {
      restaurant: { name: restaurantName, slug: restaurantSlug },
      outlet_id: outlet.id,
      outlet_name: outlet.name,
      timezone: tz,
      bookings_enabled: outlet.bookings_enabled,
      is_open_now: isOutletOpen(outlet.opening_hours, tz, now).open,
      policy: {
        slot_minutes: outlet.booking_slot_minutes,
        turn_minutes: outlet.booking_turn_minutes,
        max_party_size: outlet.booking_max_party_size,
        advance_days: outlet.booking_advance_days,
        deposit_per_guest: Number(outlet.booking_deposit_per_guest ?? 0),
        deposit_min_party: outlet.booking_deposit_min_party ?? 1,
      },
      payment_methods: {
        online_enabled: payCfg.onlineEnabled,
        razorpay: {
          enabled: payCfg.razorpayEnabled && Boolean(payCfg.razorpayKeyId),
          key_id: payCfg.razorpayKeyId,
        },
        stripe: {
          enabled: payCfg.stripeEnabled,
          publishable_key: payCfg.stripePublishableKey,
        },
      },
      zones,
      waitlist_summary: {
        waiting_parties: waitingToday,
        estimated_wait_minutes: estimateWaitlistMinutes({
          activeWaitlistCount: waitingToday,
          partySize,
          totalTablesCount: tables.length,
        }),
      },
      date: dateStr,
      party_size: partySize,
      slots,
    },
    { headers: cors },
  );
}

type CreateBookingBody = {
  outlet_id?: string;
  restaurant_slug?: string;
  booking_type?: "reservation" | "waitlist";
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string | null;
  party_size?: number;
  preferred_zone?: string | null;
  occasion?: string | null;
  special_requests?: string | null;
  reserved_for?: string;
  table_id?: string | null;
};

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let cors = apiCorsHeaders(origin, "GET, POST, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `bookings-post:ip:${ip}`,
    limit: 30,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many booking requests. Please wait a minute." },
      { status: 429, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
    );
  }

  let apiKey: ApiKeyContext | null = null;
  if (presentedApiKey(request)) {
    const check = await authenticateApiKeyAnyScope(request, [
      "bookings:write",
      "orders:write",
    ]);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.error },
        { status: check.status, headers: { ...cors, ...rateLimitHeaders(ipLimit) } },
      );
    }
    apiKey = check.key;
    cors = apiCorsHeaders(
      origin,
      "GET, POST, OPTIONS",
      apiKey.allowedOrigins,
      request.url,
    );
  }
  cors = { ...cors, ...rateLimitHeaders(ipLimit) };
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers: cors });

  const body = (await request.json().catch(() => null)) as CreateBookingBody | null;
  if (!body) return fail(400, "Invalid JSON request body");

  const admin = createAdminClient();
  const resolved = await resolveOutletScope({
    admin,
    apiKey,
    outletIdParam: body.outlet_id,
    slugParam: body.restaurant_slug,
  });
  if (!resolved.ok) return fail(resolved.status, resolved.error);

  const { outlet } = resolved;
  if (!outlet.bookings_enabled) {
    return fail(409, `${outlet.name} is not accepting table bookings right now`);
  }

  const bookingType =
    body.booking_type === "waitlist" ? "waitlist" : "reservation";
  const customerName = String(body.customer_name ?? "").trim();
  const customerPhone = String(body.customer_phone ?? "").trim();
  const customerEmail = body.customer_email?.trim() || null;
  const partySize = Math.floor(Number(body.party_size ?? 0));
  const preferredZone = body.preferred_zone?.trim() || null;
  const occasion = body.occasion?.trim().slice(0, 60) || null;
  const specialRequests = body.special_requests?.trim().slice(0, 300) || null;

  if (!customerName || customerName.length > 120) {
    return fail(400, "Enter a valid guest name");
  }
  const phoneDigits = customerPhone.replace(/[^\d]/g, "");
  if (phoneDigits.length < 7 || customerPhone.length > 30) {
    return fail(400, "Enter a valid mobile number");
  }
  if (
    !Number.isFinite(partySize) ||
    partySize < 1 ||
    partySize > outlet.booking_max_party_size
  ) {
    return fail(
      400,
      `Party size must be between 1 and ${outlet.booking_max_party_size} guests`,
    );
  }

  const tz = resolveTimeZone(outlet.timezone);
  const now = new Date();
  const nowMs = now.getTime();

  // Walk-in waitlist path
  if (bookingType === "waitlist") {
    const openCheck = isOutletOpen(outlet.opening_hours, tz, now);
    if (!openCheck.open && !apiKey) {
      return fail(
        409,
        openCheck.nextOpen
          ? `Outlet is currently closed for walk-in waitlist (opens ${openCheck.nextOpen}). Book a scheduled reservation instead.`
          : "Outlet is currently closed for walk-in waitlist.",
      );
    }

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
    const quotedWait = estimateWaitlistMinutes({
      activeWaitlistCount: activeAhead,
      partySize,
      totalTablesCount: tables.length,
    });

    const { data: created, error } = await admin
      .from("table_bookings")
      .insert({
        restaurant_id: outlet.restaurant_id,
        outlet_id: outlet.id,
        booking_code: generateBookingCode("waitlist"),
        booking_type: "waitlist",
        source: apiKey ? "api" : "web",
        status: "waitlisted",
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        party_size: partySize,
        preferred_zone: preferredZone,
        occasion,
        special_requests: specialRequests,
        reserved_for: now.toISOString(),
        duration_minutes: outlet.booking_turn_minutes,
        quoted_wait_minutes: quotedWait,
        queue_number: maxQueue + 1,
        deposit_amount: 0,
        deposit_status: "none",
      })
      .select("*")
      .single();

    if (error || !created) {
      return fail(500, error?.message ?? "Failed to join waitlist");
    }

    return NextResponse.json(
      {
        booking: sanitizePublicBooking(created),
        payment_required: false,
        payment_methods: null,
      },
      { status: 201, headers: cors },
    );
  }

  // Scheduled reservation path
  const reservedMs = body.reserved_for
    ? new Date(body.reserved_for).getTime()
    : Number.NaN;
  if (!Number.isFinite(reservedMs)) {
    return fail(400, "Provide a valid reservation date and time");
  }
  if (reservedMs < nowMs + 10 * 60_000) {
    return fail(400, "Reservation time must be at least 10 minutes ahead");
  }
  const maxAdvanceMs = outlet.booking_advance_days * 24 * 60 * 60_000;
  if (reservedMs > nowMs + maxAdvanceMs) {
    return fail(
      400,
      `Reservations can be made up to ${outlet.booking_advance_days} days in advance`,
    );
  }

  const windowStart = new Date(reservedMs - 12 * 60 * 60_000).toISOString();
  const windowEnd = new Date(reservedMs + 12 * 60 * 60_000).toISOString();

  const [{ data: tabsData }, { data: nearBookings }, payCfg] = await Promise.all([
    admin.from("pos_tabs").select("id, name").eq("outlet_id", outlet.id),
    admin
      .from("table_bookings")
      .select("*")
      .eq("outlet_id", outlet.id)
      .gte("reserved_for", windowStart)
      .lte("reserved_for", windowEnd),
    getPublicPaymentConfig(outlet.id),
  ]);

  const tables = parseOutletFloorTables(tabsData ?? []);
  const specificTableId =
    body.table_id && isUuid(body.table_id) ? body.table_id : null;

  const avail = checkSlotAvailability({
    tables,
    bookings: nearBookings ?? [],
    slotStartMs: reservedMs,
    durationMinutes: outlet.booking_turn_minutes,
    partySize,
    preferredZone,
    specificTableId,
    nowMs,
  });

  if (!avail.available) {
    return fail(409, avail.reason ?? "Selected time slot is unavailable");
  }

  const depositAmount = computeBookingDeposit(
    partySize,
    Number(outlet.booking_deposit_per_guest ?? 0),
    Number(outlet.booking_deposit_min_party ?? 1),
  );
  const onlinePayAvailable =
    payCfg.onlineEnabled &&
    ((payCfg.razorpayEnabled && Boolean(payCfg.razorpayKeyId)) ||
      payCfg.stripeEnabled);
  const paymentRequired = depositAmount > 0 && onlinePayAvailable;

  const { data: created, error } = await admin
    .from("table_bookings")
    .insert({
      restaurant_id: outlet.restaurant_id,
      outlet_id: outlet.id,
      table_id: avail.suggestedTableId,
      booking_code: generateBookingCode("reservation"),
      booking_type: "reservation",
      source: apiKey ? "api" : "web",
      status: paymentRequired ? "pending_payment" : "confirmed",
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      party_size: partySize,
      preferred_zone: preferredZone,
      occasion,
      special_requests: specialRequests,
      reserved_for: new Date(reservedMs).toISOString(),
      duration_minutes: outlet.booking_turn_minutes,
      deposit_amount: depositAmount,
      deposit_status: paymentRequired ? "pending" : "none",
    })
    .select("*")
    .single();

  if (error || !created) {
    return fail(500, error?.message ?? "Failed to create booking");
  }

  return NextResponse.json(
    {
      booking: sanitizePublicBooking(created),
      payment_required: paymentRequired,
      payment_methods: paymentRequired
        ? {
            razorpay: {
              enabled: payCfg.razorpayEnabled && Boolean(payCfg.razorpayKeyId),
              key_id: payCfg.razorpayKeyId,
            },
            stripe: {
              enabled: payCfg.stripeEnabled,
              publishable_key: payCfg.stripePublishableKey,
            },
          }
        : null,
    },
    { status: 201, headers: cors },
  );
}
