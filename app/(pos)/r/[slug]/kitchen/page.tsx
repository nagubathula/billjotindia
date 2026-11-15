import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChefHat } from "lucide-react";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { loadKitchenBoardData } from "@/lib/kitchen";
import { POS_ROLES, ROLE_LABEL, canTakePayment } from "@/lib/roles";
import { KitchenBoard } from "@/components/KitchenBoard";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function PosKitchenPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const { role } = await requireRole(POS_ROLES, {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/kitchen`,
  });

  const { outlets, stations, productStationMap, orders } =
    await loadKitchenBoardData(restaurant.id);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/r/${params.slug}/pos`} />}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            POS
          </Button>
          <div className="flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-primary" />
            <div>
              <h1 className="text-sm font-semibold leading-tight text-foreground">
                Kitchen Board
              </h1>
              <p className="text-[11px] text-muted-foreground">{restaurant.name}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {ROLE_LABEL[role]}
          </Badge>
          <FullscreenToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        <KitchenBoard
          slug={params.slug}
          initialOrders={orders}
          outlets={outlets}
          stations={stations}
          productStationMap={productStationMap}
          canCancelOrder={canTakePayment(role)}
        />
      </main>
    </div>
  );
}
