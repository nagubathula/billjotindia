import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getCurrentUser, getPublicRestaurant } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { OrderStatusPipeline } from "@/components/OrderStatusPipeline";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// SECURITY NOTE: customer-order matching is by email (no FK from orders to
// auth.users yet). This works for orders the customer placed while signed in
// OR signed out with the same email. A follow-up adds orders.customer_user_id
// for stricter scoping.

type Props = { params: { slug: string } };

export default async function MyOrdersPage({ params }: Props) {
  const restaurant = await getPublicRestaurant(params.slug);
  if (!restaurant) notFound();

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/r/${params.slug}/me/orders`)}`);
  }

  const email = (user.email ?? "").toLowerCase();

  // Admin client because orders are RLS-locked to staff; we're letting the
  // customer see their own orders via an explicit email match. This is the
  // standard pattern for "user-facing data scoped by a field other than RLS".
  const admin = createAdminClient();

  // Resolve outlets belonging to this restaurant so we can scope orders
  // even if email collisions exist across tenants (defensive).
  const { data: outlets } = await admin
    .from("outlets")
    .select("id, name")
    .eq("restaurant_id", restaurant.id);
  const outletIds = (outlets ?? []).map((o) => o.id);

  const { data: orders } = await admin
    .from("orders")
    .select("*")
    .eq("customer_email", email)
    .in("outlet_id", outletIds.length > 0 ? outletIds : [-1])
    .order("created_at", { ascending: false })
    .limit(50);

  const ords = (orders ?? []) as Order[];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Your orders</h1>
        <p className="text-sm text-muted-foreground">
          Orders you placed at {restaurant.name} using{" "}
          <span className="text-foreground">{user.email}</span>.
        </p>
      </header>

      {ords.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No orders yet"
          description="When you order from this restaurant, your history will appear here."
          action={
            <Link
              href={`/r/${params.slug}`}
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              Browse menu
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {ords.map((o) => (
            <Card key={o.id} className="transition hover:border-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {o.unique_order_id ?? `#${o.id}`}
                    </span>
                    <Badge variant="outline" className="capitalize">
                      {o.order_type}
                    </Badge>
                  </span>
                  <Link
                    href={`/r/${params.slug}/orders/${o.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    View →
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <OrderStatusPipeline status={o.status as OrderStatus} />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {o.placed_at
                      ? new Date(o.placed_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </span>
                  <span className="font-semibold tabular-nums">
                    ₹{Number(o.total_amount).toFixed(0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
