import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ChefHat,
  ChevronRight,
  Globe,
  LayoutDashboard,
  Receipt,
  Store,
  Zap,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: Receipt,
    title: "Counter POS and thermal KOT",
    body: "Keyboard-first billing with a full GST breakdown, item codes and kitchen tickets routed to the right station.",
  },
  {
    icon: ChefHat,
    title: "Live kitchen display",
    body: "A real-time order board with elapsed timers, cooking instructions and one-tap bump actions.",
  },
  {
    icon: Globe,
    title: "Direct online ordering",
    body: "A commission-free storefront for dine-in QR, takeaway and delivery, always in sync with your menu.",
  },
  {
    icon: Store,
    title: "Multi-outlet, multi-brand",
    body: "Run every branch and brand from one admin, with outlet-level pricing and opening hours.",
  },
  {
    icon: BarChart3,
    title: "GST and tender reports",
    body: "Reconcile cash, UPI, card and Section 9(5) aggregator sales, then export the ledger as CSV.",
  },
  {
    icon: Zap,
    title: "Aggregator ready",
    body: "One order schema built for Zomato, Swiggy and ONDC alongside your own channels.",
  },
];

const stats = [
  { value: "< 15s", label: "Average counter bill" },
  { value: "F8–F10", label: "One-key tender checkout" },
  { value: "Multi", label: "Outlet and brand hierarchy" },
  { value: "0%", label: "Direct storefront commission" },
];

const highlights = [
  "No setup fees",
  "Keyboard shortcuts",
  "GST-compliant invoices",
  "Any browser or tablet",
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col bg-card">
      {/* Global nav: a thin translucent bar the page scrolls beneath. */}
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
          <Link
            href="/"
            className="flex items-center gap-2 text-base font-semibold tracking-tight"
          >
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Receipt className="h-3.5 w-3.5" />
            </span>
            Billjot
          </Link>
          <nav className="flex items-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "default", size: "xs" }))}
              >
                <LayoutDashboard /> Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-xs text-foreground/80 transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className={cn(buttonVariants({ variant: "default", size: "xs" }))}
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-5 pt-16 text-center sm:pt-24">
          <p className="text-base font-semibold text-primary">
            Built for Indian restaurants
          </p>
          <h1 className="mx-auto mt-3 max-w-4xl text-5xl font-semibold sm:text-6xl lg:text-7xl">
            The POS that runs your whole counter.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            Counter billing, live kitchen tickets, direct online ordering and
            GST-ready reports, in one fast, distraction-free workspace.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {user ? (
              <Link href="/dashboard" className={cn(buttonVariants({ size: "lg" }))}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/signup" className={cn(buttonVariants({ size: "lg" }))}>
                  Create your restaurant
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-0.5 text-base text-primary hover:underline"
                >
                  Sign in <ChevronRight className="h-4 w-4" />
                </Link>
              </>
            )}
          </div>

          <ul className="mx-auto mt-7 flex max-w-xs flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:max-w-none sm:gap-x-2">
            {highlights.map((h, i) => (
              <li key={h} className="flex items-center gap-2">
                {i > 0 && (
                  <span aria-hidden className="hidden sm:inline">
                    ·
                  </span>
                )}
                {h}
              </li>
            ))}
          </ul>

          {/* Product stage */}
          <div className="mx-auto mt-14 max-w-5xl rounded-t-4xl bg-background px-5 pt-10 sm:px-12 sm:pt-14">
            <HeroPreview />
          </div>
        </section>

        {/* Numbers */}
        <section className="bg-background px-5 py-16 sm:py-20">
          <dl className="mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-10 text-center lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col-reverse gap-1">
                <dt className="text-sm text-muted-foreground">{s.label}</dt>
                <dd className="text-4xl font-semibold sm:text-5xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Features */}
        <section className="px-5 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-4xl font-semibold sm:text-5xl">
                Everything the counter and kitchen need.
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Designed for speed at peak service, with nothing on screen that
                you don&apos;t need.
              </p>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-border bg-card p-6 shadow-2xs"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/80 bg-secondary text-foreground">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="bg-background px-5 py-20 text-center sm:py-28">
          <h2 className="mx-auto max-w-2xl text-4xl font-semibold sm:text-5xl">
            Start running your restaurant on Billjot.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Set up your menu, outlets and POS terminal in minutes.
          </p>
          <Link
            href={user ? "/dashboard" : "/signup"}
            className={cn(buttonVariants({ size: "lg" }), "mt-8")}
          >
            {user ? "Open dashboard" : "Create your restaurant"}
            <ArrowRight />
          </Link>
        </section>
      </main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-muted-foreground sm:flex-row">
          <span>Billjot India · POS, kitchen display and direct ordering</span>
          <Link href={user ? "/dashboard" : "/signup"} className="text-primary hover:underline">
            {user ? "Open dashboard" : "Start free"}
          </Link>
        </div>
      </footer>
    </div>
  );
}

function HeroPreview() {
  const lines = [
    { q: 2, name: "Masala Dosa", note: "Extra crispy", p: "₹240" },
    { q: 1, name: "Filter Coffee", note: null, p: "₹40" },
    { q: 3, name: "Idli Plate", note: "Sambar separate", p: "₹180" },
  ];

  return (
    <div
      aria-hidden
      className="overflow-hidden rounded-t-3xl bg-card text-left shadow-float"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Receipt className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold whitespace-nowrap">Counter POS</span>
        </div>
        <div className="flex rounded-[10px] bg-muted p-0.5 text-xs font-medium whitespace-nowrap">
          <span className="rounded-lg bg-card px-2.5 py-1 shadow-control sm:px-3">Dine-in</span>
          <span className="px-2.5 py-1 text-foreground/70 sm:px-3">Takeaway</span>
          <span className="hidden px-3 py-1 text-foreground/70 sm:block">Delivery</span>
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-[1.15fr_1fr]">
        {/* Today */}
        <div className="bg-card p-5 sm:p-6">
          <div className="text-xs text-muted-foreground">Revenue today</div>
          <div className="mt-1 text-4xl font-semibold tabular-nums">₹45,820</div>
          <div className="mt-1 text-xs font-medium text-emerald-600">
            12% ahead of yesterday
          </div>

          <div className="mt-6 flex h-20 items-end gap-1.5">
            {[28, 40, 34, 52, 70, 96, 82, 60, 44, 66, 88, 58].map((h, i) => (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full",
                  i === 5 ? "bg-primary" : "bg-primary/20",
                )}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-background p-4">
              <div className="text-xs text-muted-foreground">Bills</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums">184</div>
            </div>
            <div className="rounded-2xl bg-background p-4">
              <div className="text-xs text-muted-foreground">In the kitchen</div>
              <div className="mt-0.5 text-xl font-semibold tabular-nums">7</div>
            </div>
          </div>
        </div>

        {/* Active ticket */}
        <div className="flex flex-col bg-card p-5 sm:p-6">
          <div className="flex items-baseline justify-between">
            <span className="text-base font-semibold">Table 4</span>
            <span className="text-xs text-muted-foreground">Token 128</span>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {lines.map((row) => (
              <li key={row.name} className="flex items-center gap-3 py-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">
                  {row.q}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{row.name}</span>
                  {row.note && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.note}
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums">{row.p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">Total, incl. 5% GST</span>
            <span className="text-xl font-semibold tabular-nums">₹483</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 pb-1 text-center text-xs font-medium">
            <span className="rounded-full bg-primary py-2 text-primary-foreground">Cash</span>
            <span className="rounded-full bg-secondary py-2">UPI</span>
            <span className="rounded-full bg-secondary py-2">Card</span>
          </div>
        </div>
      </div>
    </div>
  );
}
