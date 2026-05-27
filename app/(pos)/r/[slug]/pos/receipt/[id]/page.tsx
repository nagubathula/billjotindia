import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AutoPrint } from "./AutoPrint";
import type { Order, OrderItem, Outlet, ProductConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: { id: string; slug: string } };

export default async function ReceiptPage({ params }: Params) {
  const orderId = Number(params.id);
  if (!Number.isFinite(orderId)) notFound();

  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle<Order>();
  if (!order) notFound();

  const [{ data: items }, { data: outlet }] = await Promise.all([
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
  ]);

  const lines = (items ?? []) as OrderItem[];
  const placedAt = order.placed_at ?? order.created_at;

  return (
    <div className="flex min-h-screen items-start justify-center bg-neutral-200 p-6 print:block print:bg-white print:p-0">
      <AutoPrint />

      <article className="receipt-print w-[80mm] bg-white p-3 font-mono text-[11px] leading-snug text-black shadow print:shadow-none">
        <header className="text-center">
          <div className="text-sm font-bold uppercase">{outlet?.name ?? "Outlet"}</div>
          {outlet?.address && <div className="text-[10px]">{outlet.address}</div>}
          {outlet?.gstin && <div className="text-[10px]">GSTIN: {outlet.gstin}</div>}
          {outlet?.fssai_license && (
            <div className="text-[10px]">FSSAI: {outlet.fssai_license}</div>
          )}
          {outlet?.phone && <div className="text-[10px]">Ph: {outlet.phone}</div>}
        </header>

        <hr className="my-2 border-dashed border-black" />

        <div className="flex justify-between">
          <span>Bill #{order.unique_order_id ?? order.id}</span>
          <span className="uppercase">{order.source}</span>
        </div>
        {order.token_number != null && (
          <div className="text-center text-base font-bold">TOKEN {order.token_number}</div>
        )}
        <div className="text-[10px]">
          {placedAt ? new Date(placedAt).toLocaleString("en-IN") : ""}
        </div>
        <div className="text-[10px] capitalize">{order.order_type}</div>

        <hr className="my-2 border-dashed border-black" />

        <table className="w-full">
          <thead>
            <tr className="border-b border-dashed">
              <th className="text-left font-normal">Item</th>
              <th className="w-8 text-right font-normal">Qty</th>
              <th className="w-12 text-right font-normal">₹</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const cfg = line.product_config as unknown as ProductConfig | null;
              const name = cfg?.name ?? `#${cfg?.product_id ?? "?"}`;
              return (
                <tr key={line.id}>
                  <td className="py-0.5">{name}</td>
                  <td className="text-right tabular-nums">{line.quantity}</td>
                  <td className="text-right tabular-nums">
                    {Number(line.total_price).toFixed(0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

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
        {Number(order.rounding_amount ?? 0) !== 0 && (
          <Row label="Rounding" value={Number(order.rounding_amount)} />
        )}

        <hr className="my-1 border-dashed border-black" />
        <Row label="Total" value={Number(order.total_amount)} bold />

        <hr className="my-2 border-dashed border-black" />

        <p className="text-center text-[10px]">Thank you. Visit again.</p>

        <div className="mt-3 flex flex-wrap justify-center gap-2 print:hidden">
          <a
            href={`/api/print/${orderId}`}
            download={`receipt-${orderId}.bin`}
            className="rounded border px-3 py-1 text-[10px] text-muted-foreground hover:bg-muted"
            title="Download raw ESC/POS bytes for a network/USB thermal printer"
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
