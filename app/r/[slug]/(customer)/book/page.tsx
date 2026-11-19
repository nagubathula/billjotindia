import { notFound } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { getPublicRestaurant } from "@/lib/auth";
import {
  estimateWaitlistMinutes,
  generateAvailableSlotsForDate,
  parseOutletFloorTables,
} from "@/lib/bookings";
import { isOutletOpen } from "@/lib/opening-hours";
import { getPublicPaymentConfig } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, resolveTimeZone, startOfDay } from "@/lib/time";
import { EmptyState } from "@/components/EmptyState";
import { BookingWidget } from "./BookingWidget";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    booking_id?: string;
    session_id?: string;
  }>;
};

export default async function PublicBookTablePage(props: Props) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const restaurant = await getPublicRestaurant(params.slug);
  if (!restaurant) notFound();

  const admin = createAdminClient();
  const { data: outletsData } = await admin
    .from("outlets")
    .select(
      "id, name, address, city, phone, timezone, opening_hours, bookings_enabled, booking_slot_minutes, booking_turn_minutes, booking_max_party_size, booking_advance_days, booking_deposit_per_guest, booking_deposit_min_party",
    )
    .eq("restaurant_id", restaurant.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const outlets = outletsData ?? [];
  const firstOutlet = outlets[0] ?? null;

  if (!firstOutlet) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="No active outlets"
        description={`${restaurant.name} doesn't have an active dining outlet configured yet.`}
      />
    );
  }

  const tz = resolveTimeZone(firstOutlet.timezone);
  const now = new Date();
  const initialDate = dayKey(now, tz);
  const dayStart = startOfDay(now, tz);
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60_000);

  const [{ data: tabsData }, { data: bookingsData }, payCfg] = await Promise.all([
    admin.from("pos_tabs").select("id, name").eq("outlet_id", firstOutlet.id),
    admin
      .from("table_bookings")
      .select("*")
      .eq("outlet_id", firstOutlet.id)
      .gte("reserved_for", dayStart.toISOString())
      .lte("reserved_for", windowEnd.toISOString()),
    getPublicPaymentConfig(firstOutlet.id),
  ]);

  const tables = parseOutletFloorTables(tabsData ?? []);
  const bookings = bookingsData ?? [];
  const waitingParties = bookings.filter(
    (b) =>
      b.booking_type === "waitlist" &&
      (b.status === "waitlisted" || b.status === "notified") &&
      new Date(b.created_at).getTime() >= dayStart.getTime(),
  ).length;

  const initialSlots = firstOutlet.bookings_enabled
    ? generateAvailableSlotsForDate({
        dateStr: initialDate,
        timeZone: tz,
        openingHours: firstOutlet.opening_hours,
        slotMinutes: firstOutlet.booking_slot_minutes,
        turnMinutes: firstOutlet.booking_turn_minutes,
        partySize: 2,
        tables,
        bookings,
        nowMs: now.getTime(),
      })
    : [];

  return (
    <BookingWidget
      restaurantSlug={params.slug}
      restaurantName={restaurant.name}
      outlets={outlets.map((o) => ({
        id: o.id,
        name: o.name,
        address: o.address,
        city: o.city,
        phone: o.phone,
        timezone: resolveTimeZone(o.timezone),
        bookings_enabled: o.bookings_enabled,
        booking_slot_minutes: o.booking_slot_minutes,
        booking_turn_minutes: o.booking_turn_minutes,
        booking_max_party_size: o.booking_max_party_size,
        booking_advance_days: o.booking_advance_days,
        booking_deposit_per_guest: Number(o.booking_deposit_per_guest ?? 0),
        booking_deposit_min_party: o.booking_deposit_min_party ?? 1,
      }))}
      initialDate={initialDate}
      initialAvailability={{
        bookings_enabled: firstOutlet.bookings_enabled,
        is_open_now: isOutletOpen(firstOutlet.opening_hours, tz, now).open,
        zones: [...new Set(tables.map((t) => t.zone))].sort(),
        waitlist_summary: {
          waiting_parties: waitingParties,
          estimated_wait_minutes: estimateWaitlistMinutes({
            activeWaitlistCount: waitingParties,
            partySize: 2,
            totalTablesCount: tables.length,
          }),
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
        slots: initialSlots,
      }}
      stripeReturnBookingId={query.booking_id ?? null}
      stripeReturnSessionId={query.session_id ?? null}
    />
  );
}
