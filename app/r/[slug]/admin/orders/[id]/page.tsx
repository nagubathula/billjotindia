import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantBySlug } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";
import { OrderStatusPipeline } from "@/components/OrderStatusPipeline";
import { OrderStatusActions } from "./OrderStatusActions";
import type { Order, OrderItem, OrderStatus, ProductConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  confirmed: "default",
  preparing: "default",
  ready: "default",
  completed: "outline",
  cancelled: "destructive",
};

type Props = { params: { slug: string; id: string } };

export default async function OrderDetailPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const { data: outlet } = await admin
    .from("outlets")
    .select("name, restaurant_id, gstin")
    .eq("id", order.outlet_id)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) notFound();

  const { data: items } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", id);

  const o = order as Order;
  const its = (items ?? []) as OrderItem[];
  const status = o.status as OrderStatus;

  return (
    <div className="space-y-6">
      <Link
        href={`/r/${params.slug}/admin/orders`}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-3 w-3" /> Back to orders
      </Link>

      <PageHeader
        title={`Order ${o.unique_order_id ?? `#${o.id}`}`}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{o.customer_name}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{o.customer_email}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{outlet.name}</span>
            {o.token_number != null && (
              <Badge variant="outline" className="ml-1 font-mono">
                TOKEN {o.token_number}
              </Badge>
            )}
          </span>
        }
        actions={
          <Badge variant={STATUS_VARIANT[status] ?? "outline"} className="capitalize">
            {status}
          </Badge>
        }
      />

      {/* Pipeline + workflow actions */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <OrderStatusPipeline status={status} />
          <Separator />
          <OrderStatusActions
            slug={params.slug}
            orderId={o.id}
            currentStatus={status}
          />
        </CardContent>
      </Card>

      {/* Meta */}
      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
          <Meta label="Type" value={<span className="capitalize">{o.order_type}</span>} />
          <Meta label="Source" value={<span className="uppercase">{o.source}</span>} />
          <Meta
            label="Placed"
            value={
              o.placed_at
                ? new Date(o.placed_at).toLocaleString("en-IN")
                : "—"
            }
          />
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 font-normal">Item</th>
                <th className="py-2 text-right font-normal">Qty</th>
                <th className="py-2 text-right font-normal">Price</th>
                <th className="py-2 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {its.map((line) => {
                const cfg = line.product_config as unknown as ProductConfig | null;
                return (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="py-2">
                      {cfg?.name ?? `#${cfg?.product_id ?? "?"}`}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {line.quantity}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      ₹{Number(line.unit_price).toFixed(2)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      ₹{Number(line.total_price).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Separator className="my-4" />

          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <Row label="Subtotal" value={Number(o.subtotal ?? 0)} />
            {Number(o.cgst_amount ?? 0) > 0 && (
              <Row label="CGST" value={Number(o.cgst_amount)} />
            )}
            {Number(o.sgst_amount ?? 0) > 0 && (
              <Row label="SGST" value={Number(o.sgst_amount)} />
            )}
            {Number(o.takeaway_charges ?? 0) > 0 && (
              <Row label="Packing" value={Number(o.takeaway_charges)} />
            )}
            {Number(o.discount_amount ?? 0) > 0 && (
              <Row label="Discount" value={-Number(o.discount_amount)} />
            )}
            <Separator className="my-1.5" />
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                ₹{Number(o.total_amount).toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">₹{value.toFixed(2)}</span>
    </div>
  );
}
