import { createClient } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <p className="text-red-600">
        Failed to load orders: {error.message}. Make sure RLS allows reads or
        you&apos;re signed in as admin.
      </p>
    );
  }

  const orders = (data ?? []) as Order[];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Recent orders</h1>

      {orders.length === 0 ? (
        <p className="text-neutral-500">No orders yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-100 text-left">
              <tr>
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">
                    {o.unique_order_id ?? o.id}
                  </td>
                  <td className="px-3 py-2">
                    {o.customer_name}
                    <div className="text-xs text-neutral-500">
                      {o.customer_email}
                    </div>
                  </td>
                  <td className="px-3 py-2 capitalize">{o.order_type}</td>
                  <td className="px-3 py-2">
                    ₹{Number(o.total_amount).toFixed(0)}
                  </td>
                  <td className="px-3 py-2 capitalize">{o.status}</td>
                  <td className="px-3 py-2 text-neutral-500">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
