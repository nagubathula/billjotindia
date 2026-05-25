import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Order, OrderItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrderConfirmationPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const id = Number(params.id);
  if (Number.isNaN(id)) notFound();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id);

  const o = order as Order;
  const its = (items ?? []) as OrderItem[];

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Order confirmed</h1>
      <p className="text-neutral-600">
        Thanks, {o.customer_name}. Your order reference is{" "}
        <strong>{o.unique_order_id ?? o.id}</strong>.
      </p>

      <ul className="divide-y rounded-xl border bg-white">
        {its.map((it) => {
          const cfg = it.product_config as { name?: string };
          return (
            <li key={it.id} className="flex justify-between p-3 text-sm">
              <span>
                {cfg.name ?? "Item"} × {it.quantity}
              </span>
              <span>₹{Number(it.total_price).toFixed(0)}</span>
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl border bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>₹{Number(o.subtotal).toFixed(0)}</span>
        </div>
        <div className="flex justify-between">
          <span>Takeaway</span>
          <span>₹{Number(o.takeaway_charges).toFixed(0)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span>₹{Number(o.total_amount).toFixed(0)}</span>
        </div>
        <p className="mt-3 text-xs uppercase tracking-wide text-neutral-500">
          Status: {o.status}
        </p>
      </div>

      <Link href="/" className="block text-center text-primary underline">
        Back to menu
      </Link>
    </div>
  );
}
