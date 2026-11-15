import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import {
  getAdminGatewaySettingsView,
  type AdminGatewaySettingsView,
} from "@/lib/payments";
import type { Outlet } from "@/lib/types";
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
      currentDomain={restaurant.custom_domain}
      subdomainHost={ROOT_DOMAIN ? `${restaurant.slug}.${ROOT_DOMAIN}` : null}
    />
  );
}
