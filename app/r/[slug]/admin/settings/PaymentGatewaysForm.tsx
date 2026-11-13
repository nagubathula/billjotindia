"use client";

import { useState, useTransition } from "react";
import { Check, Copy, CreditCard, ShieldCheck, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { AdminGatewaySettingsView } from "@/lib/payments";
import { updatePaymentGatewaysAction } from "./actions";

export function PaymentGatewaysForm({
  slug,
  outletId,
  outletName,
  initial,
}: {
  slug: string;
  outletId: string;
  outletName: string;
  initial: AdminGatewaySettingsView;
}) {
  const [pending, startTransition] = useTransition();
  const [codEnabled, setCodEnabled] = useState(initial.codEnabled);
  const [onlineEnabled, setOnlineEnabled] = useState(initial.onlineEnabled);
  const [razorpayEnabled, setRazorpayEnabled] = useState(
    initial.razorpayEnabled,
  );
  const [stripeEnabled, setStripeEnabled] = useState(initial.stripeEnabled);
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState<"rzp" | "stripe" | null>(
    null,
  );

  function copyWebhookUrl(kind: "rzp" | "stripe") {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const path =
      kind === "rzp" ? "/api/webhooks/razorpay" : "/api/webhooks/stripe";
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(`${origin}${path}`);
      setCopiedWebhook(kind);
      setTimeout(() => setCopiedWebhook(null), 1800);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setSavedMsg(false);

    startTransition(async () => {
      const res = await updatePaymentGatewaysAction(slug, outletId, formData);
      if (!res.ok) {
        setError(res.error);
      } else {
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 3000);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              Payment Gateways — {outletName}
            </CardTitle>
            <CardDescription className="text-xs">
              Accept UPI, Cards, Netbanking, Apple Pay, and international cards via Razorpay and Stripe on Storefront Checkout and Counter POS.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            {razorpayEnabled && (
              <Badge variant="default" className="text-[11px]">
                Razorpay Active
              </Badge>
            )}
            {stripeEnabled && (
              <Badge variant="default" className="text-[11px]">
                Stripe Active
              </Badge>
            )}
            {codEnabled && (
              <Badge variant="secondary" className="text-[11px]">
                Pay at Counter Active
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* General Checkout Toggles */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                name="online_enabled"
                checked={onlineEnabled}
                onChange={(e) => setOnlineEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <div className="text-xs font-semibold">
                  Enable Online Payments
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Allow customers to prepay online via Razorpay or Stripe at checkout.
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                name="cod_enabled"
                checked={codEnabled}
                onChange={(e) => setCodEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <div>
                <div className="text-xs font-semibold">
                  Enable Pay at Counter / Cash
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Allow dine-in QR and takeaway guests to place orders and settle at the counter.
                </div>
              </div>
            </label>
          </div>

          <Separator />

          {/* Razorpay Section */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="razorpay_enabled"
                  checked={razorpayEnabled}
                  onChange={(e) => setRazorpayEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm font-semibold">
                  Razorpay (India UPI, GPay, PhonePe, Cards &amp; Netbanking)
                </span>
              </label>

              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => copyWebhookUrl("rzp")}
              >
                {copiedWebhook === "rzp" ? (
                  <>
                    <Check className="mr-1 h-3 w-3 text-emerald-600" />
                    Copied Webhook URL
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy /api/webhooks/razorpay
                  </>
                )}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`rzp-id-${outletId}`} className="text-xs">
                  Razorpay Key ID
                </Label>
                <Input
                  id={`rzp-id-${outletId}`}
                  name="razorpay_key_id"
                  defaultValue={initial.razorpayKeyId}
                  placeholder="rzp_test_... or rzp_live_..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`rzp-sec-${outletId}`} className="text-xs">
                  Razorpay Key Secret{" "}
                  {initial.hasRazorpaySecret && (
                    <span className="text-emerald-600">
                      (Saved{initial.usingEnvRazorpay ? " via env" : ""})
                    </span>
                  )}
                </Label>
                <Input
                  id={`rzp-sec-${outletId}`}
                  name="razorpay_key_secret"
                  type="password"
                  placeholder={
                    initial.hasRazorpaySecret
                      ? "•••••••••••• (leave blank to keep)"
                      : "Enter Razorpay Key Secret"
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`rzp-wh-${outletId}`} className="text-xs">
                  Webhook Secret (Optional){" "}
                  {initial.hasRazorpayWebhookSecret && (
                    <span className="text-emerald-600">(Saved)</span>
                  )}
                </Label>
                <Input
                  id={`rzp-wh-${outletId}`}
                  name="razorpay_webhook_secret"
                  type="password"
                  placeholder={
                    initial.hasRazorpayWebhookSecret
                      ? "•••••••••••• (leave blank to keep)"
                      : "Webhook secret"
                  }
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Stripe Section */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  name="stripe_enabled"
                  checked={stripeEnabled}
                  onChange={(e) => setStripeEnabled(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm font-semibold">
                  Stripe Checkout (Credit/Debit Cards, Apple Pay, Google Pay &amp; International)
                </span>
              </label>

              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => copyWebhookUrl("stripe")}
              >
                {copiedWebhook === "stripe" ? (
                  <>
                    <Check className="mr-1 h-3 w-3 text-emerald-600" />
                    Copied Webhook URL
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy /api/webhooks/stripe
                  </>
                )}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`st-pub-${outletId}`} className="text-xs">
                  Stripe Publishable Key
                </Label>
                <Input
                  id={`st-pub-${outletId}`}
                  name="stripe_publishable_key"
                  defaultValue={initial.stripePublishableKey}
                  placeholder="pk_test_... or pk_live_..."
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`st-sec-${outletId}`} className="text-xs">
                  Stripe Secret Key{" "}
                  {initial.hasStripeSecret && (
                    <span className="text-emerald-600">
                      (Saved{initial.usingEnvStripe ? " via env" : ""})
                    </span>
                  )}
                </Label>
                <Input
                  id={`st-sec-${outletId}`}
                  name="stripe_secret_key"
                  type="password"
                  placeholder={
                    initial.hasStripeSecret
                      ? "•••••••••••• (leave blank to keep)"
                      : "sk_test_... or sk_live_..."
                  }
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`st-wh-${outletId}`} className="text-xs">
                  Webhook Signing Secret{" "}
                  {initial.hasStripeWebhookSecret && (
                    <span className="text-emerald-600">(Saved)</span>
                  )}
                </Label>
                <Input
                  id={`st-wh-${outletId}`}
                  name="stripe_webhook_secret"
                  type="password"
                  placeholder={
                    initial.hasStripeWebhookSecret
                      ? "•••••••••••• (leave blank to keep)"
                      : "whsec_..."
                  }
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Counter Dynamic UPI QR Section */}
          <div className="grid gap-2 sm:max-w-md">
            <Label
              htmlFor={`upi-vpa-${outletId}`}
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
              Counter POS Dynamic UPI ID (VPA)
            </Label>
            <Input
              id={`upi-vpa-${outletId}`}
              name="upi_vpa"
              defaultValue={initial.upiVpa}
              placeholder="e.g. manaruchulu@hdfcbank or 9848022311@ybl"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Used in Counter POS to display an instant exact-amount scannable Bharat/UPI QR code for walk-in and dine-in bills.
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Secret keys are stored server-side only and never sent to the browser.
            </span>

            <div className="flex items-center gap-3">
              {savedMsg && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <Check className="h-3.5 w-3.5" />
                  Gateway settings saved
                </span>
              )}
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving..." : "Save Payment Settings"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
