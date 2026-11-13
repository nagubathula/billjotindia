"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  Check,
  CreditCard,
  Lock,
  Minus,
  Percent,
  Plus,
  Receipt,
  ShoppingBag,
  Smartphone,
  Utensils,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/components/CartProvider";
import type { PublicPaymentConfig } from "@/lib/payments";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (resp: unknown) => void) => void;
    };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const COUPONS: {
  code: string;
  label: string;
  minOrder: number;
  calc: (sub: number) => number;
}[] = [
  {
    code: "WELCOME50",
    label: "Flat ₹50 OFF above ₹299",
    minOrder: 299,
    calc: () => 50,
  },
  {
    code: "ANDHRA10",
    label: "10% OFF up to ₹100 above ₹399",
    minOrder: 399,
    calc: (sub) => Math.min(100, Math.round(sub * 0.1)),
  },
  {
    code: "BHOJANAM100",
    label: "Flat ₹100 OFF above ₹699",
    minOrder: 699,
    calc: () => 100,
  },
];

type PaymentMethodChoice = "razorpay" | "stripe" | "cod";

export function CheckoutForm({
  restaurantSlug,
  restaurantName,
  outletId,
  paymentConfig,
  wasCancelled,
}: {
  restaurantSlug: string;
  restaurantName: string;
  outletId: string;
  paymentConfig: PublicPaymentConfig;
  wasCancelled?: boolean;
}) {
  const router = useRouter();
  const { lines, subtotal, clear, setQuantity, tableName } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [instructions, setInstructions] = useState("");
  const [orderType, setOrderType] = useState<"dine-in" | "takeaway">("dine-in");
  const [couponCode, setCouponCode] = useState<string>("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const defaultMethod: PaymentMethodChoice = paymentConfig.razorpayEnabled
    ? "razorpay"
    : paymentConfig.stripeEnabled
      ? "stripe"
      : "cod";

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodChoice>(defaultMethod);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    wasCancelled ? "Payment was cancelled. You can choose another payment method below." : null,
  );

  useEffect(() => {
    if (tableName) {
      setOrderType("dine-in");
    }
  }, [tableName]);

  const activeCouponObj = COUPONS.find((c) => c.code === appliedCoupon);
  const discountAmount =
    activeCouponObj && subtotal >= activeCouponObj.minOrder
      ? activeCouponObj.calc(subtotal)
      : 0;

  const takeawayCharges = orderType === "takeaway" ? 15 : 0;
  const total = Math.max(0, subtotal - discountAmount + takeawayCharges);

  function handleApplyCoupon(codeInput: string) {
    setCouponError(null);
    const code = codeInput.trim().toUpperCase();
    const found = COUPONS.find((c) => c.code === code);
    if (!found) {
      setCouponError("Invalid coupon code.");
      return;
    }
    if (subtotal < found.minOrder) {
      setCouponError(
        `Add ₹${found.minOrder - subtotal} more to use ${found.code}.`,
      );
      return;
    }
    setAppliedCoupon(found.code);
    setCouponCode(found.code);
  }

  function buildItemsPayload() {
    return lines.map((l) => ({
      product_config: {
        product_id: l.product.id,
        name: l.product.name,
        base_price: Number(l.product.price),
        selected_options: l.selectedOptions,
      },
      quantity: l.quantity,
      unit_price: l.unitPrice,
      total_price: l.unitPrice * l.quantity,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return;
    setSubmitting(true);
    setError(null);

    const customerDisplay = tableName
      ? `${tableName}${name ? ` · ${name}` : ""}`
      : name;

    const itemsPayload = buildItemsPayload();

    try {
      // 1. RAZORPAY CHECKOUT FLOW
      if (paymentMethod === "razorpay") {
        const sdkLoaded = await loadRazorpayScript();
        if (!sdkLoaded || !window.Razorpay) {
          throw new Error(
            "Unable to load Razorpay Checkout SDK. Check your internet connection.",
          );
        }

        const createRes = await fetch("/api/payments/razorpay/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outlet_id: outletId,
            restaurant_slug: restaurantSlug,
            source: "web",
            customer_name: customerDisplay,
            customer_phone: phone || null,
            customer_email: email || "guest@billjot.local",
            order_type: orderType,
            instructions: instructions.trim() || null,
            coupon_code: appliedCoupon,
            takeaway_charges: takeawayCharges,
            items: itemsPayload,
          }),
        });

        const createJson = (await createRes.json().catch(() => ({}))) as {
          razorpayOrderId?: string;
          amountPaise?: number;
          currency?: string;
          keyId?: string;
          error?: string;
        };

        if (!createRes.ok || !createJson.razorpayOrderId || !createJson.keyId) {
          throw new Error(
            createJson.error ?? "Failed to initialize Razorpay payment",
          );
        }

        const rzp = new window.Razorpay({
          key: createJson.keyId,
          amount: createJson.amountPaise,
          currency: createJson.currency ?? "INR",
          name: restaurantName,
          description: `Order · ${orderType === "dine-in" ? (tableName || "Dine-in") : "Takeaway"}`,
          order_id: createJson.razorpayOrderId,
          prefill: {
            name,
            email,
            contact: phone,
          },
          theme: {
            color: "#18181b",
          },
          modal: {
            ondismiss: () => {
              setSubmitting(false);
            },
          },
          handler: async (response: {
            razorpay_order_id?: string;
            razorpay_payment_id?: string;
            razorpay_signature?: string;
          }) => {
            try {
              const verifyRes = await fetch("/api/payments/razorpay/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  outlet_id: outletId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyJson = (await verifyRes.json().catch(() => ({}))) as {
                order?: { id: string };
                error?: string;
              };
              if (!verifyRes.ok || !verifyJson.order?.id) {
                throw new Error(
                  verifyJson.error ?? "Payment signature verification failed",
                );
              }
              clear();
              router.push(`/r/${restaurantSlug}/orders/${verifyJson.order.id}`);
            } catch (verErr) {
              setError(
                verErr instanceof Error
                  ? verErr.message
                  : "Payment verification failed",
              );
              setSubmitting(false);
            }
          },
        });

        rzp.on("payment.failed", (resp: unknown) => {
          const r = resp as { error?: { description?: string } };
          setError(
            r?.error?.description ?? "Razorpay payment failed. Please try again.",
          );
          setSubmitting(false);
        });

        rzp.open();
        return;
      }

      // 2. STRIPE CHECKOUT FLOW
      if (paymentMethod === "stripe") {
        const stripeRes = await fetch("/api/payments/stripe/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outlet_id: outletId,
            restaurant_slug: restaurantSlug,
            return_context: "storefront",
            source: "web",
            customer_name: customerDisplay,
            customer_phone: phone || null,
            customer_email: email || "guest@billjot.local",
            order_type: orderType,
            instructions: instructions.trim() || null,
            coupon_code: appliedCoupon,
            takeaway_charges: takeawayCharges,
            items: itemsPayload,
          }),
        });

        const stripeJson = (await stripeRes.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };

        if (!stripeRes.ok || !stripeJson.url) {
          throw new Error(
            stripeJson.error ?? "Failed to create Stripe Checkout session",
          );
        }

        window.location.href = stripeJson.url;
        return;
      }

      // 3. PAY AT COUNTER / CASH FLOW
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          source: "web",
          customer_name: customerDisplay,
          customer_phone: phone || null,
          customer_email: email || "guest@billjot.local",
          order_type: orderType,
          instructions: instructions.trim() || null,
          coupon_code: appliedCoupon,
          subtotal,
          discount_amount: discountAmount,
          takeaway_charges: takeawayCharges,
          total_amount: total,
          items: itemsPayload,
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
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <ShoppingBag className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold">Your cart is empty</h2>
          <p className="text-xs text-muted-foreground">
            Good food is always cooking. Go ahead and add dishes from the menu.
          </p>
        </div>
        <Link
          href={`/r/${restaurantSlug}`}
          className={cn(buttonVariants({ variant: "default", size: "sm" }))}
        >
          See menu
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1.2fr_380px]"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/r/${restaurantSlug}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">
              Secure Checkout
            </h1>
            {tableName && (
              <p className="text-xs font-semibold text-emerald-600">
                Dine-in table service · {tableName}
              </p>
            )}
          </div>
        </div>

        {/* Cart Items & Cooking Instructions Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">
              Items in your order
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y divide-border/60">
              {lines.map((l) => {
                const isVeg =
                  (l.product.veg_status ?? "Veg").toLowerCase() === "veg";
                return (
                  <div
                    key={l.configKey}
                    className="flex items-center justify-between gap-3 py-3 first:pt-1"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      <span
                        className={cn(
                          "mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border",
                          isVeg ? "border-emerald-600" : "border-rose-600",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            isVeg ? "bg-emerald-600" : "bg-rose-600",
                          )}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">
                          {l.product.name}
                        </div>
                        {l.selectedOptions.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {l.selectedOptions
                              .map((o) => o.option_name)
                              .join(", ")}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="inline-flex h-8 w-20 items-center justify-between rounded-lg border border-emerald-600/30 bg-background px-1.5 text-xs font-extrabold text-emerald-600">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(l.configKey, l.quantity - 1)
                          }
                          className="flex h-6 w-6 items-center justify-center rounded hover:bg-emerald-50"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="tabular-nums">{l.quantity}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity(l.configKey, l.quantity + 1)
                          }
                          className="flex h-6 w-6 items-center justify-center rounded hover:bg-emerald-50"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="w-14 text-right text-sm font-semibold tabular-nums">
                        ₹{(l.unitPrice * l.quantity).toFixed(0)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-1">
              <Input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Write cooking instructions (e.g. Less spicy, pack chutney separately)..."
                className="h-9 bg-muted/40 text-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Order Type & Table Banner */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">
              Order preference
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tableName ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                <Utensils className="h-4 w-4 shrink-0" />
                <span>
                  Your order will be served directly to{" "}
                  <strong>{tableName}</strong>.
                </span>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(["dine-in", "takeaway"] as const).map((t) => (
                  <label
                    key={t}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition",
                      orderType === t
                        ? "border-emerald-600 bg-emerald-600/5"
                        : "border-border hover:border-foreground/30",
                    )}
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
                      className={cn(
                        "h-4 w-4 rounded-full border-2",
                        orderType === t
                          ? "border-emerald-600 bg-emerald-600"
                          : "border-muted-foreground",
                      )}
                    />
                    <div className="flex-1">
                      <div className="font-semibold capitalize">{t}</div>
                      <div className="text-xs text-muted-foreground">
                        {t === "takeaway"
                          ? "+₹15 restaurant packing charge"
                          : "Served hot at the restaurant"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Your details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
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
              <Label htmlFor="ck-phone">Phone number</Label>
              <Input
                id="ck-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="+91 98480 22311"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="ck-email">Email (for invoice)</Label>
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

        {/* Payment Method Selector: Razorpay, Stripe, Pay at Counter */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm font-bold">
              <span>Choose payment method</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
                <Lock className="h-3 w-3" />
                256-bit SSL secured
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {/* Razorpay Option */}
            <label
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3.5 transition",
                paymentConfig.razorpayEnabled
                  ? "cursor-pointer"
                  : "cursor-not-allowed opacity-60",
                paymentMethod === "razorpay"
                  ? "border-emerald-600 bg-emerald-600/5"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <input
                type="radio"
                name="payment_method"
                value="razorpay"
                disabled={!paymentConfig.razorpayEnabled}
                checked={paymentMethod === "razorpay"}
                onChange={() => setPaymentMethod("razorpay")}
                className="mt-1 h-4 w-4 accent-emerald-600"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Smartphone className="h-4 w-4 text-emerald-600" />
                    Razorpay — UPI, GPay, PhonePe &amp; Cards
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Instant
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {paymentConfig.razorpayEnabled
                    ? "Pay instantly with any UPI app, RuPay/Visa/Mastercard, or Netbanking."
                    : "Not yet activated — add Razorpay keys in Admin > Outlet Settings."}
                </p>
              </div>
            </label>

            {/* Stripe Option */}
            <label
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3.5 transition",
                paymentConfig.stripeEnabled
                  ? "cursor-pointer"
                  : "cursor-not-allowed opacity-60",
                paymentMethod === "stripe"
                  ? "border-emerald-600 bg-emerald-600/5"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <input
                type="radio"
                name="payment_method"
                value="stripe"
                disabled={!paymentConfig.stripeEnabled}
                checked={paymentMethod === "stripe"}
                onChange={() => setPaymentMethod("stripe")}
                className="mt-1 h-4 w-4 accent-emerald-600"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <CreditCard className="h-4 w-4 text-foreground" />
                    Stripe — Credit / Debit Cards &amp; Apple Pay
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Global
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {paymentConfig.stripeEnabled
                    ? "Secure hosted checkout supporting domestic & international cards, Apple Pay, and Google Pay."
                    : "Not yet activated — add Stripe keys in Admin > Outlet Settings."}
                </p>
              </div>
            </label>

            {/* Pay at Counter / Cash Option */}
            {paymentConfig.codEnabled && (
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition",
                  paymentMethod === "cod"
                    ? "border-emerald-600 bg-emerald-600/5"
                    : "border-border hover:border-foreground/30",
                )}
              >
                <input
                  type="radio"
                  name="payment_method"
                  value="cod"
                  checked={paymentMethod === "cod"}
                  onChange={() => setPaymentMethod("cod")}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <Banknote className="h-4 w-4 text-muted-foreground" />
                      Pay at Counter / Cash or UPI at Table
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Send your order straight to the kitchen now and settle your bill at the restaurant.
                  </p>
                </div>
              </label>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Offers & Bill Details */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        {/* Apply Coupon Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Percent className="h-4 w-4 text-orange-600" />
              Apply Coupon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="Enter coupon code"
                className="h-9 font-mono text-xs uppercase"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleApplyCoupon(couponCode)}
              >
                Apply
              </Button>
            </div>

            {couponError && (
              <p className="text-xs text-destructive">{couponError}</p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {COUPONS.map((c) => {
                const isApplied = appliedCoupon === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleApplyCoupon(c.code)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition",
                      isApplied
                        ? "border-emerald-600 bg-emerald-600/10 text-emerald-700"
                        : "border-dashed border-border hover:bg-muted",
                    )}
                  >
                    {isApplied && <Check className="h-3 w-3" />}
                    {c.code}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Bill Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Bill Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex justify-between text-muted-foreground">
              <span>Item Total</span>
              <span className="font-medium tabular-nums text-foreground">
                ₹{subtotal.toFixed(0)}
              </span>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between font-medium text-emerald-600">
                <span>Coupon Discount ({appliedCoupon})</span>
                <span className="tabular-nums">-₹{discountAmount.toFixed(0)}</span>
              </div>
            )}

            {takeawayCharges > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Restaurant Packing Charges</span>
                <span className="tabular-nums">₹{takeawayCharges.toFixed(0)}</span>
              </div>
            )}

            <div className="flex justify-between text-muted-foreground">
              <span>GST &amp; Restaurant Taxes</span>
              <span className="text-[11px]">Included</span>
            </div>

            <Separator />

            <div className="flex justify-between pt-1 text-base font-extrabold text-foreground">
              <span>TO PAY</span>
              <span className="tabular-nums">₹{total.toFixed(0)}</span>
            </div>

            {discountAmount > 0 && (
              <div className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                You saved ₹{discountAmount.toFixed(0)} on this order!
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-[#1ba672] text-sm font-extrabold tracking-wide text-white shadow-md transition hover:bg-[#179364] disabled:opacity-50"
            >
              {submitting
                ? "PROCESSING..."
                : paymentMethod === "razorpay"
                  ? `PAY ₹${total.toFixed(0)} VIA RAZORPAY`
                  : paymentMethod === "stripe"
                    ? `PAY ₹${total.toFixed(0)} VIA STRIPE`
                    : `PLACE ORDER · ₹${total.toFixed(0)}`}
            </button>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
