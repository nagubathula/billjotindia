import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { getAdminGatewaySettingsView } from "@/lib/payments";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { OutletForm } from "./OutletForm";
import { DomainForm } from "./DomainForm";
import { PaymentGatewaysForm } from "./PaymentGatewaysForm";
import type { Outlet } from "@/lib/types";

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
  const gatewayViews =
    role === "admin"
      ? await Promise.all(
          outlets.map(async (o) => ({
            outletId: o.id,
            view: await getAdminGatewaySettingsView(o.id),
          })),
        )
      : [];

  const gatewayMap = new Map(gatewayViews.map((g) => [g.outletId, g.view]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Outlet & Payment Settings"
        description="Configure Razorpay, Stripe, Dynamic UPI QR, GSTIN, FSSAI license, custom domains, and opening hours."
      />

      {role === "admin" && (
        <DomainForm
          slug={params.slug}
          currentDomain={restaurant.custom_domain}
          subdomainHost={ROOT_DOMAIN ? `${restaurant.slug}.${ROOT_DOMAIN}` : null}
        />
      )}

      {outlets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No outlets configured.
        </p>
      ) : (
        <div className="space-y-10">
          {outlets.map((o) => {
            const gw = gatewayMap.get(o.id);
            return (
              <section key={o.id} className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{o.name}</span>
                    {o.city && (
                      <span className="text-xs text-muted-foreground">
                        · {o.city}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="tabular-nums text-[11px]">
                    ID: {o.id.slice(0, 8)}
                  </Badge>
                </div>

                {role === "admin" && gw && (
                  <PaymentGatewaysForm
                    slug={params.slug}
                    outletId={o.id}
                    outletName={o.name}
                    initial={gw}
                  />
                )}

                <OutletForm slug={params.slug} outlet={o as Outlet} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
