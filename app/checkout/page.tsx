"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, subtotal, clear } = useCart();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orderType, setOrderType] = useState<"dine-in" | "takeaway">("dine-in");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const takeawayCharges = orderType === "takeaway" ? 10 : 0;
  const total = subtotal + takeawayCharges;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_email: email,
          order_type: orderType,
          subtotal,
          takeaway_charges: takeawayCharges,
          total_amount: total,
          items: lines.map((l) => ({
            product_config: {
              product_id: l.product.id,
              name: l.product.name,
              base_price: Number(l.product.price),
            },
            quantity: l.quantity,
            unit_price: Number(l.product.price),
            total_price: Number(l.product.price) * l.quantity,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to place order");
      }

      const { order } = await res.json();
      clear();
      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (lines.length === 0) {
    return <p className="py-16 text-center text-neutral-500">Cart is empty.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Checkout</h1>

      <label className="block">
        <span className="text-sm text-neutral-600">Name</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-sm text-neutral-600">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm text-neutral-600">Order type</legend>
        {(["dine-in", "takeaway"] as const).map((t) => (
          <label key={t} className="flex items-center gap-2">
            <input
              type="radio"
              name="order_type"
              value={t}
              checked={orderType === t}
              onChange={() => setOrderType(t)}
            />
            <span className="capitalize">{t}</span>
          </label>
        ))}
      </fieldset>

      <div className="rounded-xl border bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>₹{subtotal.toFixed(0)}</span>
        </div>
        <div className="flex justify-between">
          <span>Takeaway charges</span>
          <span>₹{takeawayCharges.toFixed(0)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span>₹{total.toFixed(0)}</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-primary py-2 font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "Placing order..." : "Place order"}
      </button>
    </form>
  );
}
