import { notFound } from "next/navigation";
import { getRestaurantBySlug } from "@/lib/auth";
import { loadKitchenBoardData } from "@/lib/kitchen";
import { PageHeader } from "@/components/PageHeader";
import { KitchenBoard } from "@/components/KitchenBoard";

export const dynamic = "force-dynamic";

export default async function KitchenPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const { outlets, stations, productStationMap, orders } =
    await loadKitchenBoardData(restaurant.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kitchen (KDS)"
        description="Live kitchen tickets grouped by stage. Items added by later KOTs are highlighted."
      />

      <KitchenBoard
        slug={params.slug}
        initialOrders={orders}
        outlets={outlets}
        stations={stations}
        productStationMap={productStationMap}
        canCancelOrder={true}
      />
    </div>
  );
}
