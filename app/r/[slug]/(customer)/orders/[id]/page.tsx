import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantBySlug } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OrderStatusPipeline } from "@/components/OrderStatusPipeline";
import type { Order, OrderItem, OrderStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// SECURITY NOTE: uses the service-role admin client because anonymous
// customers can place orders and need to see the confirmation. Anyone with
// the order ID URL can view it — fine for v0 with opaque IDs but a real
// product should match against unique_order_id token or require sign-in.

type Props = { params: { slug: string; id: string } };

export default async function OrderConfirmationPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const id = Number(params.id);
  if (Number.isNaN(id)) notFound();

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const { data: outlet } = await supabase
    .from("outlets")
    .select("restaurant_id, name")
    .eq("id", order.outlet_id)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id);

  const o = order as Order;
  const its = (items ?? []) as OrderItem[];
  const status = o.status as OrderStatus;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <h1 className="mt-3 text-2xl font-semibold">Order confirmed</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Thanks, {o.customer_name}. We sent a copy to{" "}
          <span className="text-foreground">{o.customer_email}</span>.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs">
          <span className="text-muted-foreground">Order</span>
          <span className="font-mono">{o.unique_order_id ?? `#${o.id}`}</span>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <OrderStatusPipeline status={status} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <ul className="divide-y">
            {its.map((it) => {
              const cfg = it.product_config as { name?: string };
              return (
                <li
                  key={it.id}
                  className="flex justify-between gap-2 py-2 text-sm"
                >
                  <span>
                    {cfg.name ?? "Item"}
                    <span className="text-muted-foreground"> × {it.quantity}</span>
                  </span>
                  <span className="tabular-nums">
                    ₹{Number(it.total_price).toFixed(0)}
                  </span>
                </li>
              );
            })}
          </ul>
          <Separator />
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={Number(o.subtotal)} />
            {Number(o.takeaway_charges) > 0 && (
              <Row label="Packing" value={Number(o.takeaway_charges)} />
            )}
            <Separator className="my-1.5" />
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                ₹{Number(o.total_amount).toFixed(0)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          href={`/r/${params.slug}`}
          className="inline-flex items-center text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-3 w-3" /> Back to menu
        </Link>
        <Badge variant="outline" className="capitalize">
          {o.order_type}
        </Badge>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">₹{value.toFixed(0)}</span>
    </div>
  );
}
