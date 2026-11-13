import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RawPosTab } from "../TableFloorBoard";
import { QrSheetClient } from "./QrSheetClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function AdminTablesQrSheetPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/tables/qr-sheet`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped =
    outletIds.length > 0
      ? outletIds
      : ["00000000-0000-0000-0000-000000000000"];

  const admin = createAdminClient();
  const { data: posTabsData } = await admin
    .from("pos_tabs")
    .select("id, outlet_id, name, lines, updated_at")
    .in("outlet_id", scoped)
    .order("name", { ascending: true });

  const tabs: RawPosTab[] = (posTabsData ?? []).map((t) => ({
    id: t.id,
    outlet_id: t.outlet_id,
    name: t.name,
    lines: Array.isArray(t.lines) ? (t.lines as RawPosTab["lines"]) : [],
    updated_at: t.updated_at,
  }));

  return (
    <QrSheetClient
      slug={params.slug}
      restaurantName={restaurant.name}
      outlets={outlets.map((o) => ({ id: o.id, name: o.name, city: o.city }))}
      tabs={tabs}
    />
  );
}
