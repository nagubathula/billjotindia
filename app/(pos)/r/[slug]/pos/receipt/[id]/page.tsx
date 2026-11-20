import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoPrint } from "./AutoPrint";
import { formatSelectedOptionLabel } from "@/lib/customizations";
import { resolveEffectiveStationId } from "@/lib/kot-routing";
import { formatOrderTenderLabel } from "@/lib/register";
import type { Order, OrderItem, OrderPayment, Outlet, ProductConfig } from "@/lib/types";
import { isUuid } from "@/lib/utils";
import { resolveTimeZone } from "@/lib/time";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string; slug: string }>;
  searchParams: Promise<{ mode?: string; station?: string }>;
};

export default async function ReceiptPage(props: Params) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const orderId = params.id;
  if (!isUuid(orderId)) notFound();

  const isKotMode = query.mode === "kot";
  const stationFilter = query.station?.trim() || null;

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle<Order>();
  if (!order) notFound();

  const [
    { data: items },
    { data: outlet },
    { data: paymentsData },
    { data: stationsData },
    { data: categoriesData },
    { data: productsData },
  ] = await Promise.all([
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("id"),
    supabase
      .from("outlets")
      .select("*")
      .eq("id", order.outlet_id)
      .maybeSingle<Outlet>(),
    supabase
      .from("order_payments")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    supabase
      .from("kitchen_stations")
      .select("id, name")
      .eq("outlet_id", order.outlet_id),
    supabase
      .from("categories")
      .select("name, station_id")
      .eq("outlet_id", order.outlet_id),
    supabase
      .from("products")
      .select("id, category, station_id, is_kot_required")
      .eq("outlet_id", order.outlet_id),
  ]);

  const stationNameById = new Map((stationsData ?? []).map((s) => [s.id, s.name]));
  const catStationMap = new Map(
    (categoriesData ?? []).map((c) => [c.name.trim().toLowerCase(), c.station_id ?? null]),
  );
  const prodMap = new Map((productsData ?? []).map((p) => [p.id, p]));

  const rawLines = (items ?? []) as OrderItem[];
  const lines = isKotMode
    ? rawLines.filter((line) => {
        const cfg = line.product_config as unknown as ProductConfig | null;
        const pid = cfg?.product_id;
        const prod = pid ? prodMap.get(pid) : undefined;
        if (prod && prod.is_kot_required === false) return false;
        if (!stationFilter) return true;
        const stId = resolveEffectiveStationId(prod, catStationMap);
        const stName = stId ? stationNameById.get(stId) ?? "" : "";
        return stName.toLowerCase() === stationFilter.toLowerCase();
      })
    : rawLines;

  const payments = (paymentsData ?? []) as OrderPayment[];
  const placedAt = order.placed_at ?? order.created_at;
  const tenderMode = formatOrderTenderLabel(order, payments);
  const escPosHref = isKotMode
    ? `/api/print/${orderId}?mode=kot${stationFilter ? `&station=${encodeURIComponent(stationFilter)}` : ""}`
    : `/api/print/${orderId}`;

  return (
    <div className="flex min-h-screen items-start justify-center bg-neutral-200 p-6 print:block print:bg-white print:p-0">
      <AutoPrint />

      <article className="receipt-print w-[80mm] bg-white p-3 font-mono text-[11px] leading-snug text-black shadow print:shadow-none">
        {isKotMode ? (
          <header className="text-center">
            <div className="text-base font-bold uppercase tracking-wide">
              {stationFilter ? `KOT · ${stationFilter}` : "KITCHEN ORDER TICKET"}
            </div>
            <div className="text-[11px] font-semibold uppercase">
              {outlet?.name ?? "Outlet"}
            </div>
          </header>
        ) : (
          <header className="text-center">
            <div className="text-sm font-bold uppercase">{outlet?.name ?? "Outlet"}</div>
            {outlet?.address && <div className="text-[10px]">{outlet.address}</div>}
            {outlet?.gstin && <div className="text-[10px]">GSTIN: {outlet.gstin}</div>}
            {outlet?.fssai_license && (
              <div className="text-[10px]">FSSAI: {outlet.fssai_license}</div>
            )}
            {outlet?.phone && <div className="text-[10px]">Ph: {outlet.phone}</div>}
          </header>
        )}

        <hr className="my-2 border-dashed border-black" />

        <div className="flex justify-between">
          <span>Bill #{order.unique_order_id ?? order.id.slice(0, 8)}</span>
          <span className="uppercase">{order.source}</span>
        </div>
        {order.token_number != null && (
          <div className="my-1 border border-black py-0.5 text-center text-base font-bold">
            TOKEN #{order.token_number}
          </div>
        )}
        <div className="flex justify-between text-[10px]">
          <span>
            {placedAt
              ? new Date(placedAt).toLocaleString("en-IN", {
                  timeZone: resolveTimeZone(outlet?.timezone),
                })
              : ""}
          </span>
          <span className="uppercase font-semibold">{order.order_type}</span>
        </div>
        {order.customer_name && order.customer_name !== "Walk-in" && (
          <div className="text-[10px]">Customer: {order.customer_name}</div>
        )}
        {!isKotMode && tenderMode && (
          <div className="text-[10px] uppercase">Paid via: {tenderMode}</div>
        )}

        <hr className="my-2 border-dashed border-black" />

        {isKotMode ? (
          <div className="space-y-2">
            {lines.length === 0 ? (
              <div className="py-2 text-center text-[10px] italic">
                No KOT items for {stationFilter ?? "kitchen"}.
              </div>
            ) : (
              lines.map((line) => {
                const cfg = line.product_config as unknown as ProductConfig | null;
                const name = cfg?.name ?? `#${cfg?.product_id ?? "?"}`;
                const opts = cfg?.selected_options ?? [];
                return (
                  <div key={line.id} className="border-b border-dotted border-black pb-1">
                    <div className="text-[12px] font-bold">
                      {line.quantity} × {name}
                    </div>
                    {opts.length > 0 && (
                      <div className="pl-2 text-[10px]">
                        + {opts.map((o) => formatSelectedOptionLabel(o)).join(", ")}
                      </div>
                    )}
                    {line.instructions && (
                      <div className="pl-2 text-[10px] font-semibold italic">
                        NOTE: {line.instructions}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dashed border-black">
                <th className="text-left font-normal">Item</th>
                <th className="w-8 text-right font-normal">Qty</th>
                <th className="w-12 text-right font-normal">₹</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const cfg = line.product_config as unknown as ProductConfig | null;
                const name = cfg?.name ?? `#${cfg?.product_id ?? "?"}`;
                const opts = cfg?.selected_options ?? [];
                return (
                  <tr key={line.id} className="align-top">
                    <td className="py-0.5 pr-1">
                      <div>{name}</div>
                      {opts.length > 0 && (
                        <div className="text-[9px] text-neutral-700">
                          + {opts.map((o) => formatSelectedOptionLabel(o)).join(", ")}
                        </div>
                      )}
                      {line.instructions && (
                        <div className="text-[9px] italic">Note: {line.instructions}</div>
                      )}
                    </td>
                    <td className="py-0.5 text-right tabular-nums">{line.quantity}</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {Number(line.total_price).toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {order.instructions && (
          <div className="mt-1.5 border-t border-dashed border-black pt-1 text-[10px] italic">
            Order Note: {order.instructions}
          </div>
        )}

        {!isKotMode && (
          <>
            <hr className="my-2 border-dashed border-black" />

            <Row label="Subtotal" value={Number(order.subtotal ?? 0)} />
            {Number(order.cgst_amount ?? 0) > 0 && (
              <Row label="CGST" value={Number(order.cgst_amount)} />
            )}
            {Number(order.sgst_amount ?? 0) > 0 && (
              <Row label="SGST" value={Number(order.sgst_amount)} />
            )}
            {Number(order.igst_amount ?? 0) > 0 && (
              <Row label="IGST" value={Number(order.igst_amount)} />
            )}
            {Number(order.takeaway_charges ?? 0) > 0 && (
              <Row label="Packing" value={Number(order.takeaway_charges)} />
            )}
            {Number(order.discount_amount ?? 0) > 0 && (
              <Row label="Discount" value={-Number(order.discount_amount)} />
            )}
            {Number(order.loyalty_discount_amount ?? 0) > 0 && (
              <Row
                label={`Loyalty (${order.loyalty_points_redeemed ?? 0} pts)`}
                value={-Number(order.loyalty_discount_amount)}
              />
            )}
            {Number(order.rounding_amount ?? 0) !== 0 && (
              <Row label="Rounding" value={Number(order.rounding_amount)} />
            )}

            <hr className="my-1 border-dashed border-black" />
            <Row label="Total" value={Number(order.total_amount)} bold />

            {Number(order.loyalty_points_earned ?? 0) > 0 && (
              <div className="mt-1.5 border border-dashed border-black px-1.5 py-0.5 text-center text-[10px] font-semibold">
                Earned +{order.loyalty_points_earned} loyalty pts today!
              </div>
            )}

            <hr className="my-2 border-dashed border-black" />
            <p className="text-center text-[10px]">Thank you. Visit again.</p>
          </>
        )}

        <div className="mt-3 flex flex-wrap justify-center gap-1.5 print:hidden">
          <a
            href={
              isKotMode
                ? `/r/${params.slug}/pos/receipt/${orderId}`
                : `/r/${params.slug}/pos/receipt/${orderId}?mode=kot`
            }
            className="rounded border px-2.5 py-1 text-[10px] text-neutral-700 hover:bg-neutral-100"
          >
            {isKotMode ? "Tax Receipt" : "KOT Slip"}
          </a>
          <a
            href={escPosHref}
            download={`${isKotMode ? "kot" : "receipt"}-${orderId}.bin`}
            className="rounded border px-2.5 py-1 text-[10px] text-neutral-700 hover:bg-neutral-100"
            title="Download raw ESC/POS bytes for thermal printer"
          >
            ESC/POS
          </a>
          <a
            href={`/r/${params.slug}/pos`}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
          >
            New bill
          </a>
        </div>
      </article>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-[12px]" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">₹{value.toFixed(2)}</span>
    </div>
  );
}
