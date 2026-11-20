import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import {
  getAdminGatewaySettingsView,
  type AdminGatewaySettingsView,
} from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import type { KitchenStation, Outlet, Printer } from "@/lib/types";
import { SettingsWorkbench } from "./SettingsWorkbench";

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

type Props = { params: Promise<{ slug: string }> };

export default async function SettingsPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();
  const { role } = await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const admin = createAdminClient();

  const [printersRes, stationsRes] =
    outletIds.length > 0
      ? await Promise.all([
          admin
            .from("printers")
            .select("*")
            .in("outlet_id", outletIds)
            .order("name"),
          admin
            .from("kitchen_stations")
            .select("*")
            .in("outlet_id", outletIds)
            .order("sort_order")
            .order("name"),
        ])
      : [{ data: [] }, { data: [] }];

  const printersByOutlet: Record<string, Printer[]> = {};
  for (const p of (printersRes.data ?? []) as Printer[]) {
    (printersByOutlet[p.outlet_id] ??= []).push(p);
  }

  const stationsByOutlet: Record<string, KitchenStation[]> = {};
  for (const s of (stationsRes.data ?? []) as KitchenStation[]) {
    (stationsByOutlet[s.outlet_id] ??= []).push(s);
  }

  const gatewayViews: Record<string, AdminGatewaySettingsView> = {};
  if (role === "admin") {
    const entries = await Promise.all(
      outlets.map(async (o) => ({
        outletId: o.id,
        view: await getAdminGatewaySettingsView(o.id),
      })),
    );
    for (const entry of entries) {
      gatewayViews[entry.outletId] = entry.view;
    }
  }

  return (
    <SettingsWorkbench
      slug={params.slug}
      role={role}
      outlets={outlets as Outlet[]}
      gatewayViews={gatewayViews}
      printersByOutlet={printersByOutlet}
      stationsByOutlet={stationsByOutlet}
      currentDomain={restaurant.custom_domain}
      subdomainHost={ROOT_DOMAIN ? `${restaurant.slug}.${ROOT_DOMAIN}` : null}
    />
  );
}
