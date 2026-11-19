"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  Sparkles,
  Users,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BOOKING_OCCASIONS,
  buildBookingWhatsAppUrl,
  computeBookingDeposit,
  formatBookingTime,
  type BookingSlotOption,
} from "@/lib/bookings";
import { cn } from "@/lib/utils";

type PublicOutletInfo = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  timezone: string;
  bookings_enabled: boolean;
  booking_slot_minutes: number;
  booking_turn_minutes: number;
  booking_max_party_size: number;
  booking_advance_days: number;
  booking_deposit_per_guest: number;
  booking_deposit_min_party: number;
};

type ConfirmedBookingView = {
  id: string;
  booking_code: string;
  booking_type: string;
  status: string;
  customer_name: string;
  customer_phone?: string;
  party_size: number;
  preferred_zone: string | null;
  occasion: string | null;
  reserved_for: string;
  duration_minutes: number;
  quoted_wait_minutes: number | null;
  queue_number: number | null;
  deposit_amount: number;
  deposit_status: string;
  outlet_id: string;
};

type PaymentMethodsShape = {
  online_enabled: boolean;
  razorpay: { enabled: boolean; key_id: string | null };
  stripe: { enabled: boolean; publishable_key: string | null };
};

type AvailabilityResponse = {
  bookings_enabled: boolean;
  is_open_now: boolean;
  zones: string[];
  waitlist_summary: {
    waiting_parties: number;
    estimated_wait_minutes: number;
  };
  payment_methods: PaymentMethodsShape;
  slots: BookingSlotOption[];
};

type RazorpayConstructor = new (options: Record<string, unknown>) => {
  open: () => void;
};

function loadRazorpaySdk(): Promise<RazorpayConstructor | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor })
    .Razorpay;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () =>
      resolve(
        (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay ??
          null,
      );
    script.onerror = () => resolve(null);
    document.body.appendChild(script);
  });
}

export function BookingWidget({
  restaurantSlug,
  restaurantName,
  outlets,
  initialDate,
  initialAvailability,
  stripeReturnBookingId,
  stripeReturnSessionId,
}: {
  restaurantSlug: string;
  restaurantName: string;
  outlets: PublicOutletInfo[];
  initialDate: string;
  initialAvailability: AvailabilityResponse;
  stripeReturnBookingId?: string | null;
  stripeReturnSessionId?: string | null;
}) {
  const [outletId, setOutletId] = useState<string>(outlets[0]?.id ?? "");
  const outlet = useMemo(
    () => outlets.find((o) => o.id === outletId) ?? outlets[0],
    [outlets, outletId],
  );

  const [mode, setMode] = useState<"reservation" | "waitlist" | "lookup">(
    "reservation",
  );
  const [dateStr, setDateStr] = useState<string>(initialDate);
  const [partySize, setPartySize] = useState<string>("2");
  const [preferredZone, setPreferredZone] = useState<string>("any");
  const [selectedSlotIso, setSelectedSlotIso] = useState<string>(
    () =>
      initialAvailability.slots.find((s) => s.available)?.iso ?? "",
  );
  const [availability, setAvailability] =
    useState<AvailabilityResponse>(initialAvailability);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Guest form state (all controlled)
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [occasion, setOccasion] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  // Lookup state
  const [lookupCode, setLookupCode] = useState("");
  const [lookupPhoneLast4, setLookupPhoneLast4] = useState("");

  // Submission & payment state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedBookingView | null>(null);
  const [paymentPending, setPaymentPending] = useState<{
    booking: ConfirmedBookingView;
    methods: PaymentMethodsShape;
  } | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  const fetchAvailability = useCallback(
    async (nextOutletId: string, nextDate: string, nextParty: number, nextZone: string) => {
      if (!nextOutletId || !nextDate) return;
      setLoadingSlots(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          outlet_id: nextOutletId,
          date: nextDate,
          party_size: String(nextParty),
        });
        if (nextZone && nextZone !== "any") qs.set("zone", nextZone);
        const res = await fetch(`/api/bookings?${qs.toString()}`);
        const data = (await res.json().catch(() => null)) as
          | (AvailabilityResponse & { error?: string })
          | null;
        if (res.ok && data) {
          setAvailability(data);
          setSelectedSlotIso((prev) => {
            if (prev && data.slots.some((s) => s.iso === prev && s.available)) {
              return prev;
            }
            return data.slots.find((s) => s.available)?.iso ?? "";
          });
        }
      } finally {
        setLoadingSlots(false);
      }
    },
    [],
  );

  // Auto-verify returning Stripe Checkout session for booking cover charge
  useEffect(() => {
    if (!stripeReturnBookingId || !stripeReturnSessionId) return;
    let cancelled = false;
    setPayBusy(true);
    fetch(`/api/bookings/${encodeURIComponent(stripeReturnBookingId)}/deposit/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gateway: "stripe",
        session_id: stripeReturnSessionId,
      }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (ok && d?.booking) {
          setConfirmed(d.booking as ConfirmedBookingView);
          setPaymentPending(null);
        } else {
          setError(d?.error ?? "Unable to confirm Stripe deposit payment.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Unable to verify payment status.");
      })
      .finally(() => {
        if (!cancelled) setPayBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stripeReturnBookingId, stripeReturnSessionId]);

  const numericParty = Math.max(1, Math.floor(Number(partySize) || 2));
  const maxDate = useMemo(() => {
    const base = new Date(`${initialDate}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + (outlet?.booking_advance_days ?? 30));
    return base.toISOString().slice(0, 10);
  }, [initialDate, outlet?.booking_advance_days]);

  const expectedDeposit = outlet
    ? computeBookingDeposit(
        numericParty,
        outlet.booking_deposit_per_guest,
        outlet.booking_deposit_min_party,
      )
    : 0;

  async function handleSubmitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!outlet || submitting) return;
    if (mode === "reservation" && !selectedSlotIso) {
      setError("Please choose an available time slot.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outlet.id,
          restaurant_slug: restaurantSlug,
          booking_type: mode === "waitlist" ? "waitlist" : "reservation",
          customer_name: guestName.trim(),
          customer_phone: guestPhone.trim(),
          customer_email: guestEmail.trim() || undefined,
          party_size: numericParty,
          preferred_zone: preferredZone === "any" ? undefined : preferredZone,
          occasion: occasion || undefined,
          special_requests: specialRequests.trim() || undefined,
          reserved_for:
            mode === "reservation" ? selectedSlotIso : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        booking?: ConfirmedBookingView;
        payment_required?: boolean;
        payment_methods?: PaymentMethodsShape | null;
        error?: string;
      };
      if (!res.ok || !json.booking) {
        setError(json.error ?? "Unable to submit booking.");
        return;
      }
      const bookedWithPhone: ConfirmedBookingView = {
        ...json.booking,
        customer_phone: guestPhone.trim(),
      };
      if (json.payment_required && json.payment_methods) {
        setPaymentPending({
          booking: bookedWithPhone,
          methods: json.payment_methods,
        });
      } else {
        setConfirmed(bookedWithPhone);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRazorpayDeposit() {
    if (!paymentPending || payBusy) return;
    setPayBusy(true);
    setError(null);
    try {
      const Razorpay = await loadRazorpaySdk();
      if (!Razorpay) {
        throw new Error("Could not load Razorpay SDK. Check network.");
      }

      const createRes = await fetch(
        `/api/bookings/${encodeURIComponent(paymentPending.booking.id)}/deposit/razorpay`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_code: paymentPending.booking.booking_code,
          }),
        },
      );
      const createJson = (await createRes.json().catch(() => ({}))) as {
        razorpayOrderId?: string;
        amountPaise?: number;
        currency?: string;
        keyId?: string;
        error?: string;
      };
      if (!createRes.ok || !createJson.razorpayOrderId || !createJson.keyId) {
        throw new Error(createJson.error ?? "Failed to start deposit payment.");
      }

      const rzp = new Razorpay({
        key: createJson.keyId,
        amount: createJson.amountPaise,
        currency: createJson.currency ?? "INR",
        name: restaurantName,
        description: `Table Deposit · ${paymentPending.booking.booking_code}`,
        order_id: createJson.razorpayOrderId,
        prefill: {
          name: paymentPending.booking.customer_name,
          contact: paymentPending.booking.customer_phone,
        },
        theme: { color: "#059669" },
        modal: {
          ondismiss: () => setPayBusy(false),
        },
        handler: async (resp: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          const verifyRes = await fetch(
            `/api/bookings/${encodeURIComponent(paymentPending.booking.id)}/deposit/verify`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ gateway: "razorpay", ...resp }),
            },
          );
          const verifyJson = (await verifyRes.json().catch(() => ({}))) as {
            booking?: ConfirmedBookingView;
            error?: string;
          };
          if (!verifyRes.ok || !verifyJson.booking) {
            setError(
              verifyJson.error ?? "Deposit signature verification failed.",
            );
            setPayBusy(false);
            return;
          }
          setConfirmed({
            ...verifyJson.booking,
            customer_phone: paymentPending.booking.customer_phone,
          });
          setPaymentPending(null);
          setPayBusy(false);
        },
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed.");
      setPayBusy(false);
    }
  }

  async function handleStripeDeposit() {
    if (!paymentPending || payBusy) return;
    setPayBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(paymentPending.booking.id)}/deposit/stripe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            booking_code: paymentPending.booking.booking_code,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Unable to create Stripe payment session.");
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stripe checkout failed.");
      setPayBusy(false);
    }
  }

  async function handleLookupBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!outlet) return;
    setSubmitting(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        outlet_id: outlet.id,
        code: lookupCode.trim().toUpperCase(),
        phone: lookupPhoneLast4.trim(),
      });
      const res = await fetch(`/api/bookings?${qs.toString()}`);
      const json = (await res.json().catch(() => ({}))) as {
        booking?: ConfirmedBookingView;
        error?: string;
      };
      if (!res.ok || !json.booking) {
        setError(json.error ?? "No matching booking found.");
        return;
      }
      setConfirmed({
        ...json.booking,
        customer_phone: lookupPhoneLast4.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelConfirmed() {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(confirmed.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel",
            booking_code: confirmed.booking_code,
            phone: confirmed.customer_phone ?? guestPhone,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        booking?: { status: string };
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Unable to cancel booking.");
        return;
      }
      setConfirmed((prev) =>
        prev ? { ...prev, status: json.booking?.status ?? "cancelled" } : null,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-12">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/r/${restaurantSlug}`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to Menu
        </Link>
        {outlet && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span>{outlet.city ?? outlet.name}</span>
          </div>
        )}
      </div>

      {/* Confirmation or Pending Payment View */}
      {paymentPending ? (
        <Card className="rounded-2xl border-amber-300/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-amber-600" />
              Complete Cover Deposit to Confirm
            </CardTitle>
            <CardDescription>
              Booking ref{" "}
              <span className="font-mono font-semibold text-foreground">
                {paymentPending.booking.booking_code}
              </span>{" "}
              is temporarily held for 20 minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reservation</span>
                <span className="font-semibold">
                  {formatBookingTime(
                    paymentPending.booking.reserved_for,
                    outlet?.timezone,
                  )}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Guests</span>
                <span className="font-semibold">
                  {paymentPending.booking.party_size} guests
                </span>
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Refundable Cover Charge</span>
                <span className="tabular-nums text-primary">
                  ₹{Number(paymentPending.booking.deposit_amount).toFixed(0)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Deducted from your final dining bill at the restaurant.
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {paymentPending.methods.razorpay.enabled && (
                <Button
                  type="button"
                  disabled={payBusy}
                  onClick={handleRazorpayDeposit}
                  className="flex-1"
                >
                  {payBusy ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  Pay ₹{Number(paymentPending.booking.deposit_amount).toFixed(0)}{" "}
                  with Razorpay
                </Button>
              )}
              {paymentPending.methods.stripe.enabled && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={payBusy}
                  onClick={handleStripeDeposit}
                  className="flex-1"
                >
                  Pay with Card (Stripe)
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : confirmed ? (
        <Card className="rounded-2xl border-emerald-500/40">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">
              {confirmed.status === "cancelled"
                ? "Booking Cancelled"
                : confirmed.booking_type === "waitlist"
                  ? `You're #${confirmed.queue_number ?? "—"} on the Waitlist`
                  : "Table Reservation Confirmed"}
            </CardTitle>
            <CardDescription>
              Reference code:{" "}
              <span className="font-mono text-sm font-bold text-foreground">
                {confirmed.booking_code}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guest</span>
                <span className="font-semibold">
                  {confirmed.customer_name} ({confirmed.party_size} guests)
                </span>
              </div>
              {confirmed.booking_type === "waitlist" ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Wait</span>
                  <span className="font-semibold">
                    ~{confirmed.quoted_wait_minutes ?? 15} mins
                  </span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date &amp; Time</span>
                  <span className="font-semibold">
                    {formatBookingTime(confirmed.reserved_for, outlet?.timezone)}
                  </span>
                </div>
              )}
              {confirmed.preferred_zone && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Section</span>
                  <span>{confirmed.preferred_zone}</span>
                </div>
              )}
              {confirmed.deposit_status === "paid" && (
                <div className="flex justify-between text-emerald-700">
                  <span>Cover Deposit</span>
                  <span className="font-semibold">
                    ₹{Number(confirmed.deposit_amount).toFixed(0)} Paid (Credit on Bill)
                  </span>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {(() => {
                const targetPhone =
                  confirmed.customer_phone ?? outlet?.phone ?? "";
                const waUrl = targetPhone
                  ? buildBookingWhatsAppUrl({
                      phone: targetPhone,
                      customerName: confirmed.customer_name,
                      restaurantName,
                      bookingCode: confirmed.booking_code,
                      kind: "confirmed",
                      reservedFor: confirmed.reserved_for,
                      partySize: confirmed.party_size,
                      timeZone: outlet?.timezone,
                    })
                  : null;
                return waUrl ? (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "flex-1",
                    )}
                  >
                    <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" />
                    Save to WhatsApp
                  </a>
                ) : null;
              })()}
              <Link
                href={`/r/${restaurantSlug}`}
                className={cn(buttonVariants({ variant: "default" }), "flex-1")}
              >
                <Utensils className="mr-1.5 h-4 w-4" />
                Browse Menu
              </Link>
            </div>

            {confirmed.status !== "cancelled" &&
              confirmed.status !== "seated" &&
              confirmed.status !== "completed" && (
                <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setConfirmed(null)}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Make another booking
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCancelConfirmed}
                    className="font-medium text-destructive hover:underline"
                  >
                    Cancel reservation
                  </button>
                </div>
              )}
          </CardContent>
        </Card>
      ) : (
        /* Main Booking & Waitlist Form Card */
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="space-y-3 border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-xl">
                  Reserve a Table at {restaurantName}
                </CardTitle>
                <CardDescription>
                  Instant table confirmation or live walk-in waitlist token.
                </CardDescription>
              </div>
              {outlets.length > 1 && (
                <Select
                  value={outletId}
                  onValueChange={(nextId) => {
                    if (!nextId) return;
                    setOutletId(nextId);
                    fetchAvailability(
                      nextId,
                      dateStr,
                      numericParty,
                      preferredZone,
                    );
                  }}
                >
                  <SelectTrigger size="sm" className="w-44 text-xs">
                    <SelectValue>{outlet?.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setMode("reservation");
                  setError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-2 font-semibold transition-colors",
                  mode === "reservation"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Reserve Table
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("waitlist");
                  setError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-2 font-semibold transition-colors",
                  mode === "waitlist"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Clock className="h-3.5 w-3.5" />
                Walk-in Waitlist
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("lookup");
                  setError(null);
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-2 font-semibold transition-colors",
                  mode === "lookup"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Search className="h-3.5 w-3.5" />
                Find Booking
              </button>
            </div>
          </CardHeader>

          <CardContent className="pt-5">
            {mode === "lookup" ? (
              <form onSubmit={handleLookupBooking} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="lk-code">Booking Reference Code</Label>
                    <Input
                      id="lk-code"
                      required
                      value={lookupCode}
                      onChange={(e) => setLookupCode(e.target.value)}
                      placeholder="e.g. RES-7K9P2M or WL-..."
                      className="font-mono uppercase"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="lk-phone">Phone (last 4 digits)</Label>
                    <Input
                      id="lk-phone"
                      required
                      value={lookupPhoneLast4}
                      onChange={(e) => setLookupPhoneLast4(e.target.value)}
                      placeholder="3210"
                    />
                  </div>
                </div>
                {error && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Searching…" : "Look Up Booking"}
                </Button>
              </form>
            ) : !availability.bookings_enabled ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {outlet?.name} is currently taking reservations by phone only
                {outlet?.phone ? `: ${outlet.phone}` : "."}
              </div>
            ) : (
              <form onSubmit={handleSubmitBooking} className="space-y-4">
                {mode === "waitlist" && (
                  <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
                    <div>
                      <div className="font-semibold text-amber-900 dark:text-amber-200">
                        Live Walk-in Waitlist
                      </div>
                      <div className="text-amber-800/80 dark:text-amber-300/80">
                        {availability.waitlist_summary.waiting_parties === 0
                          ? "No queue ahead of you"
                          : `${availability.waitlist_summary.waiting_parties} parties waiting ahead`}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-amber-400/60 bg-background font-semibold text-amber-800 dark:text-amber-300"
                    >
                      ~{availability.waitlist_summary.estimated_wait_minutes}m wait
                    </Badge>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-party">Guests</Label>
                    <Select
                      value={partySize}
                      onValueChange={(v) => {
                        if (!v) return;
                        setPartySize(v);
                        if (mode === "reservation") {
                          fetchAvailability(
                            outletId,
                            dateStr,
                            Number(v),
                            preferredZone,
                          );
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: Math.min(20, outlet?.booking_max_party_size ?? 20) },
                          (_, i) => String(i + 1),
                        ).map((n) => (
                          <SelectItem key={n} value={n}>
                            {n} {n === "1" ? "Guest" : "Guests"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {mode === "reservation" && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="pub-date">Date</Label>
                      <Input
                        id="pub-date"
                        type="date"
                        min={initialDate}
                        max={maxDate}
                        value={dateStr}
                        onChange={(e) => {
                          const next = e.target.value;
                          setDateStr(next);
                          fetchAvailability(
                            outletId,
                            next,
                            numericParty,
                            preferredZone,
                          );
                        }}
                      />
                    </div>
                  )}

                  {availability.zones.length > 0 && (
                    <div className="grid gap-1.5">
                      <Label>Seating Section</Label>
                      <Select
                        value={preferredZone}
                        onValueChange={(z) => {
                          if (!z) return;
                          setPreferredZone(z);
                          if (mode === "reservation") {
                            fetchAvailability(
                              outletId,
                              dateStr,
                              numericParty,
                              z,
                            );
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Best available</SelectItem>
                          {availability.zones.map((z) => (
                            <SelectItem key={z} value={z}>
                              {z}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {mode === "reservation" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Select Time Slot</Label>
                      {loadingSlots && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Updating availability…
                        </span>
                      )}
                    </div>

                    {availability.slots.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                        Closed on this date or no slots open. Try another date.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {availability.slots.map((slot) => {
                          const selected = selectedSlotIso === slot.iso;
                          return (
                            <button
                              key={slot.time}
                              type="button"
                              disabled={!slot.available}
                              onClick={() => setSelectedSlotIso(slot.iso)}
                              className={cn(
                                "rounded-lg border px-2.5 py-2 text-xs font-medium transition",
                                !slot.available
                                  ? "cursor-not-allowed border-border/50 bg-muted/40 text-muted-foreground/50 line-through"
                                  : selected
                                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                    : "border-border bg-card text-foreground hover:border-primary/50",
                              )}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-name">Your Name</Label>
                    <Input
                      id="pub-name"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Asha Reddy"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-phone">Mobile Number</Label>
                    <Input
                      id="pub-phone"
                      required
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="9876543210"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-email">Email (for receipt)</Label>
                    <Input
                      id="pub-email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="optional@email.com"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-notes">Special Request</Label>
                    <Input
                      id="pub-notes"
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      placeholder="High chair, outdoor seat…"
                    />
                  </div>
                </div>

                {mode === "reservation" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Occasion (optional)
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {BOOKING_OCCASIONS.map((occ) => (
                        <button
                          key={occ}
                          type="button"
                          onClick={() =>
                            setOccasion((prev) => (prev === occ ? "" : occ))
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
                            occasion === occ
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {occ}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {mode === "reservation" &&
                  expectedDeposit > 0 &&
                  availability.payment_methods.online_enabled &&
                  (availability.payment_methods.razorpay.enabled ||
                    availability.payment_methods.stripe.enabled) && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-3.5 py-2.5 text-xs text-emerald-900 dark:text-emerald-200">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div>
                        <span className="font-semibold">
                          ₹{expectedDeposit.toFixed(0)} refundable cover deposit
                        </span>{" "}
                        required for {numericParty} guests — automatically adjusted against your final restaurant bill.
                      </div>
                    </div>
                  )}

                {error && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={
                    submitting ||
                    (mode === "reservation" && !selectedSlotIso)
                  }
                  className="w-full"
                >
                  <Users className="mr-1.5 h-4 w-4" />
                  {submitting
                    ? "Submitting…"
                    : mode === "waitlist"
                      ? `Join Waitlist (~${availability.waitlist_summary.estimated_wait_minutes}m)`
                      : expectedDeposit > 0 &&
                          availability.payment_methods.online_enabled &&
                          (availability.payment_methods.razorpay.enabled ||
                            availability.payment_methods.stripe.enabled)
                        ? `Continue & Pay ₹${expectedDeposit.toFixed(0)} Deposit`
                        : "Confirm Table Reservation"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
