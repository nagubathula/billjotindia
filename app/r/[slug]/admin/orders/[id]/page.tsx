import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRestaurantBySlug } from "@/lib/auth";
import { isUuid } from "@/lib/utils";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";
import { OrderStatusPipeline } from "@/components/OrderStatusPipeline";
import { OrderStatusActions } from "./OrderStatusActions";
import { cancelReasonLabel } from "@/lib/order-cancel";
import type { Order, OrderItem, OrderStatus, ProductConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  confirmed: "default",
  preparing: "default",
  ready: "default",
  completed: "outline",
  cancelled: "destructive",
};

type Props = { params: Promise<{ slug: string; id: string }> };

export default async function OrderDetailPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const id = params.id;
  if (!isUuid(id)) notFound();

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
  const orderLabel = o.unique_order_id ?? `#${o.id}`;
  const extPayload =
    o.external_payload &&
    typeof o.external_payload === "object" &&
    !Array.isArray(o.external_payload)
      ? (o.external_payload as {
          gateway?: string;
          paid?: boolean;
          payment_id?: string;
        })
      : null;
  const isPaidOnline = o.external_status === "paid" || Boolean(extPayload?.paid);
  const posTenderMode = o.customer_email?.startsWith("pos+")
    ? o.customer_email.split("@")[0].replace("pos+", "").toUpperCase()
    : null;
  const paymentMethodLabel = isPaidOnline
    ? extPayload?.gateway === "stripe"
      ? "Paid · Stripe"
      : "Paid · Razorpay"
    : posTenderMode
      ? `Paid · POS ${posTenderMode}`
      : "Pay at Counter / COD";

  const configOf = (line: OrderItem) =>
    line.product_config as unknown as ProductConfig | null;
  const lines = its.map((line) => {
    const cfg = configOf(line);
    return { productId: cfg?.product_id ?? null, name: cfg?.name ?? "Item" };
  });
  const outOfStockNames = (o.cancel_product_ids ?? [])
    .map((pid) => lines.find((l) => l.productId === pid)?.name)
    .filter((n): n is string => !!n);

  return (
    <div className="space-y-6">
      <Link
        href={`/r/${params.slug}/admin/orders`}
        className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-3 w-3" /> Back to orders
      </Link>

      <PageHeader
        title={`Order ${orderLabel}`}
        description={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span>{o.customer_name}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{o.customer_email}</span>
            <span className="text-muted-foreground/50">·</span>
            <span>{outlet.name}</span>
            {o.token_number != null && (
              <Badge variant="outline" className="ml-1 tabular-nums text-[11px]">
                TOKEN #{o.token_number}
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            <Link
              href={`/r/${params.slug}/pos/receipt/${o.id}`}
              target="_blank"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Receipt
            </Link>
            <Badge
              variant={STATUS_VARIANT[status] ?? "outline"}
              className="capitalize"
            >
              {status}
            </Badge>
          </>
        }
      />

      {/* Pipeline + workflow actions */}
      <Card>
        <CardContent className="space-y-4 pt-2">
          <OrderStatusPipeline status={status} />
          <Separator />
          <OrderStatusActions
            slug={params.slug}
            orderId={o.id}
            orderLabel={orderLabel}
            currentStatus={status}
            lines={lines}
          />
        </CardContent>
      </Card>

      {/* Meta */}
      <Card>
        <CardContent className="grid gap-3 pt-2 sm:grid-cols-4">
          <Meta
            label="Order Type"
            value={<span className="capitalize">{o.order_type}</span>}
          />
          <Meta
            label="Source Channel"
            value={<span className="uppercase">{o.source}</span>}
          />
          <Meta
            label="Payment"
            value={
              <div>
                <div className="font-medium">{paymentMethodLabel}</div>
                {extPayload?.payment_id && (
                  <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                    {extPayload.payment_id}
                  </div>
                )}
              </div>
            }
          />
          <Meta
            label="Placed At"
            value={
              o.placed_at
                ? new Date(o.placed_at).toLocaleString("en-IN", {
                    timeZone: DEFAULT_TIME_ZONE,
                  })
                : "—"
            }
          />
        </CardContent>
      </Card>

      {status === "cancelled" && o.cancel_reason && (
        <Card className="border-destructive/30">
          <CardContent className="grid gap-3 pt-2 sm:grid-cols-3">
            <Meta
              label="Cancelled because"
              value={cancelReasonLabel(o.cancel_reason)}
            />
            <Meta
              label="Cancelled by"
              value={<span className="capitalize">{o.cancelled_by ?? "—"}</span>}
            />
            <Meta
              label="Cancelled at"
              value={
                o.cancelled_at
                  ? new Date(o.cancelled_at).toLocaleString("en-IN", {
                      timeZone: DEFAULT_TIME_ZONE,
                    })
                  : "—"
              }
            />
            {outOfStockNames.length > 0 && (
              <div className="sm:col-span-3">
                <Meta label="Out of stock" value={outOfStockNames.join(", ")} />
              </div>
            )}
            {o.cancel_note && (
              <div className="sm:col-span-3">
                <Meta label="Note" value={o.cancel_note} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {o.instructions && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-2">
            <Meta
              label="Kitchen / Packing Instructions"
              value={<span className="whitespace-pre-wrap">{o.instructions}</span>}
            />
          </CardContent>
        </Card>
      )}

      {/* Items */}
      <Card>
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle>Order Items</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Unit Price</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {its.map((line) => {
                const cfg = configOf(line);
                const options = cfg?.selected_options ?? [];
                return (
                  <tr
                    key={line.id}
                    className="border-b align-top last:border-0"
                  >
                    <td className="py-2.5">
                      <span className="font-medium text-foreground">
                        {cfg?.name ?? `#${cfg?.product_id ?? "?"}`}
                      </span>
                      {options.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          {options.map((s) => s.option_name).join(" · ")}
                        </div>
                      )}
                      {line.instructions && (
                        <div className="mt-0.5 text-[11px] font-medium text-amber-700">
                          Note: {line.instructions}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {line.quantity}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      ₹{Number(line.unit_price).toFixed(2)}
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums">
                      ₹{Number(line.total_price).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Separator className="my-4" />

          <div className="ml-auto max-w-xs space-y-1.5 text-xs">
            <Row label="Taxable Subtotal" value={Number(o.subtotal ?? 0)} />
            {Number(o.cgst_amount ?? 0) > 0 && (
              <Row label="CGST" value={Number(o.cgst_amount)} />
            )}
            {Number(o.sgst_amount ?? 0) > 0 && (
              <Row label="SGST" value={Number(o.sgst_amount)} />
            )}
            {Number(o.takeaway_charges ?? 0) > 0 && (
              <Row label="Packing Charges" value={Number(o.takeaway_charges)} />
            )}
            {Number(o.discount_amount ?? 0) > 0 && (
              <Row label="Discount" value={-Number(o.discount_amount)} />
            )}
            <Separator className="my-1.5" />
            <div className="flex justify-between text-sm font-semibold text-foreground">
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
      <div className="text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-medium text-foreground">{value}</div>
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
