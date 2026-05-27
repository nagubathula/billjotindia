"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/components/CartProvider";

export function CheckoutForm({
  restaurantSlug,
  outletId,
}: {
  restaurantSlug: string;
  outletId: number;
}) {
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
          outlet_id: outletId,
          source: "web",
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
              selected_options: l.selectedOptions,
            },
            quantity: l.quantity,
            unit_price: l.unitPrice,
            total_price: l.unitPrice * l.quantity,
          })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to place order");
      }

      const { order } = await res.json();
      clear();
      router.push(`/r/${restaurantSlug}/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (lines.length === 0) {
    return (
      <p className="py-16 text-center text-muted-foreground">Cart is empty.</p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-6 lg:grid-cols-[1fr_360px]"
    >
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Checkout</h1>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ck-name">Full name</Label>
              <Input
                id="ck-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Asha Reddy"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ck-email">Email</Label>
              <Input
                id="ck-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Order type</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {(["dine-in", "takeaway"] as const).map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                  orderType === t
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <input
                  type="radio"
                  name="order_type"
                  value={t}
                  checked={orderType === t}
                  onChange={() => setOrderType(t)}
                  className="sr-only"
                />
                <div
                  className={`h-4 w-4 rounded-full border-2 ${
                    orderType === t ? "border-primary bg-primary" : "border-muted-foreground"
                  }`}
                />
                <div className="flex-1">
                  <div className="font-medium capitalize">{t}</div>
                  <div className="text-xs text-muted-foreground">
                    {t === "takeaway"
                      ? "+₹10 packing charge"
                      : "Eat at the restaurant"}
                  </div>
                </div>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Order summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="space-y-1">
              {lines.map((l) => (
                <li key={l.configKey} className="flex justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {l.product.name}{" "}
                    <span className="text-muted-foreground">× {l.quantity}</span>
                    {l.selectedOptions.length > 0 && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {l.selectedOptions.map((o) => o.option_name).join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    ₹{(l.unitPrice * l.quantity).toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
            <Separator />
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">₹{subtotal.toFixed(0)}</span>
            </div>
            {takeawayCharges > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Packing</span>
                <span className="tabular-nums">₹{takeawayCharges.toFixed(0)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">₹{total.toFixed(0)}</span>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="mt-2 h-11 w-full text-base"
            >
              {submitting ? "Placing order…" : `Place order · ₹${total.toFixed(0)}`}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              GST and additional charges shown on the final invoice.
            </p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
