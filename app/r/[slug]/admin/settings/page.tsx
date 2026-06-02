import { notFound } from "next/navigation";
import { Store } from "lucide-react";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { OutletForm } from "./OutletForm";
import { DomainForm } from "./DomainForm";
import type { Outlet } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

type Props = { params: { slug: string } };

export default async function SettingsPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();
  const { role } = await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Outlet details flow into receipts, GST invoices, and the customer storefront."
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
          No outlets configured. This shouldn't happen — contact support.
        </p>
      ) : (
        outlets.map((o) => (
          <section key={o.id} className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{o.name}</span>
              <Badge variant="outline" className="font-mono text-[10px]">
                #{o.id}
              </Badge>
            </div>
            <OutletForm slug={params.slug} outlet={o as Outlet} />
          </section>
        ))
      )}
    </div>
  );
}
