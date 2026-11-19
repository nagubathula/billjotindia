import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { parseOutletFloorTables, type FloorTableInfo } from "@/lib/bookings";
import { getOutletsForRestaurant, getSelectedOutlet } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTimeZone } from "@/lib/time";
import type { TableBooking } from "@/lib/types";
import { BookingsWorkbench } from "./BookingsWorkbench";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function AdminBookingsPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/bookings`,
  });

  const [selectedOutlet, outlets] = await Promise.all([
    getSelectedOutlet(restaurant.id, params.slug),
    getOutletsForRestaurant(restaurant.id),
  ]);

  if (!selectedOutlet || outlets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Configure an outlet first in Settings before managing table bookings.
      </p>
    );
  }

  const outletIds = outlets.map((o) => o.id);
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

  const admin = createAdminClient();
  const [{ data: tabsData }, { data: bookingsData }] = await Promise.all([
    admin
      .from("pos_tabs")
      .select("id, outlet_id, name")
      .in("outlet_id", outletIds)
      .order("name", { ascending: true }),
    admin
      .from("table_bookings")
      .select("*")
      .in("outlet_id", outletIds)
      .gte("reserved_for", sinceIso)
      .order("reserved_for", { ascending: true }),
  ]);

  const floorTablesByOutlet: Record<string, FloorTableInfo[]> = {};
  for (const oid of outletIds) {
    floorTablesByOutlet[oid] = parseOutletFloorTables(
      (tabsData ?? []).filter((t) => t.outlet_id === oid),
    );
  }

  return (
    <BookingsWorkbench
      slug={params.slug}
      restaurantName={restaurant.name}
      outlets={outlets.map((o) => ({
        id: o.id,
        name: o.name,
        city: o.city,
        timezone: resolveTimeZone(o.timezone),
        bookings_enabled: o.bookings_enabled,
        booking_slot_minutes: o.booking_slot_minutes,
        booking_turn_minutes: o.booking_turn_minutes,
        booking_max_party_size: o.booking_max_party_size,
        booking_advance_days: o.booking_advance_days,
        booking_deposit_per_guest: Number(o.booking_deposit_per_guest ?? 0),
        booking_deposit_min_party: o.booking_deposit_min_party ?? 1,
      }))}
      initialOutletId={selectedOutlet.id}
      bookings={(bookingsData ?? []) as TableBooking[]}
      floorTablesByOutlet={floorTablesByOutlet}
    />
  );
}
