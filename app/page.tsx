import Link from "next/link";
import {
  ArrowRight,
  LayoutDashboard,
  Receipt,
  Store,
  Zap,
  Globe,
  BarChart3,
  ShoppingBag,
  IndianRupee,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: Receipt,
    title: "Counter POS + KOT",
    body: "GST-compliant billing, thermal receipts, and kitchen tickets routed by station.",
  },
  {
    icon: Store,
    title: "Multi-outlet & multi-brand",
    body: "Run several branches off one menu library. Group franchises under a brand.",
  },
  {
    icon: Globe,
    title: "Online ordering",
    body: "A branded storefront for dine-in QR, pickup and delivery — no aggregator cut.",
  },
  {
    icon: BarChart3,
    title: "Live reports",
    body: "Sales, top items and trends across every outlet, updated in real time.",
  },
  {
    icon: ShoppingBag,
    title: "Customer ordering",
    body: "Carts, checkout and order tracking your customers can use from any phone.",
  },
  {
    icon: Zap,
    title: "Aggregator-ready",
    body: "Schema built for Zomato / Swiggy / ONDC. Wire up once you're an approved partner.",
  },
];

const highlights = [
  "No setup fees",
  "Works on any device",
  "GST-ready invoices",
  "Free onboarding",
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Receipt className="h-4 w-4" />
            </span>
            Billjot
          </span>
          <nav className="flex items-center gap-2 text-sm">
            {user ? (
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "default", size: "sm" }))}
              >
                <LayoutDashboard className="mr-1.5 h-4 w-4" /> Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className={cn(buttonVariants({ variant: "default", size: "sm" }))}
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
        <section className="relative overflow-hidden">
          {/* Ambient background */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,color-mix(in_oklch,var(--foreground)_4%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--foreground)_4%,transparent)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[460px] w-[760px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]"
          />

          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28">
            {/* Copy */}
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Built for Indian F&amp;B
              </span>

              <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                The POS that runs your{" "}
                <span className="text-primary">whole counter</span>
              </h1>

              <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
                Counter billing, kitchen tickets, online ordering and
                multi-outlet reports — one platform built to take on Petpooja's
                turf.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {user ? (
                  <Link
                    href="/dashboard"
                    className={cn(buttonVariants({ size: "lg" }))}
                  >
                    Open your dashboard <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/signup"
                      className={cn(buttonVariants({ size: "lg" }))}
                    >
                      Create your restaurant{" "}
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                    <Link
                      href="/login"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "lg" }),
                      )}
                    >
                      I have an account
                    </Link>
                  </>
                )}
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
                {highlights.map((h) => (
                  <li
                    key={h}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>

            {/* Product preview */}
            <HeroPreview />
          </div>
        </section>

        {/* Stats strip */}
        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden px-6 py-10 sm:grid-cols-4">
            {[
              { value: "< 30s", label: "Average bill time" },
              { value: "100%", label: "Works offline" },
              { value: "Multi", label: "Outlet & brand" },
              { value: "0%", label: "Aggregator cut" },
            ].map((s) => (
              <div key={s.label} className="px-2 text-center">
                <div className="text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
                  {s.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-20 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything the counter needs
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              One system from the kitchen to the customer&apos;s phone.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-6 py-16 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]"
            />
            <div className="relative">
              <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Start running your restaurant on Billjot
              </h2>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Set up your menu, outlets and counter in minutes. Free to start.
              </p>
              <div className="mt-8 flex justify-center">
                <Link
                  href={user ? "/dashboard" : "/signup"}
                  className={cn(buttonVariants({ size: "lg" }))}
                >
                  {user ? "Open dashboard" : "Create your restaurant"}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Receipt className="h-3.5 w-3.5" />
            </span>
            Billjot
          </span>
          <span>Made for Indian restaurants.</span>
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Start free →
          </Link>
        </div>
      </footer>
    </div>
  );
}

/* A lightweight, image-free product preview built from tokens. */
function HeroPreview() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-b from-primary/10 to-transparent blur-2xl"
      />
      <div className="rounded-3xl border border-border bg-card p-4 shadow-2xl shadow-foreground/5">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 px-2 pb-3">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/60" />
          <span className="ml-2 text-xs text-muted-foreground">
            Billjot · Counter
          </span>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: IndianRupee, label: "Today", value: "₹45,820" },
            { icon: Receipt, label: "Bills", value: "184" },
            { icon: TrendingUp, label: "Growth", value: "+12%" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-border bg-background p-3"
            >
              <s.icon className="h-4 w-4 text-primary" />
              <div className="mt-2 text-base font-semibold tracking-tight">
                {s.value}
              </div>
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Order lines */}
        <div className="mt-3 rounded-xl border border-border bg-background p-3">
          <div className="flex items-center justify-between border-b border-border pb-2 text-xs font-medium text-muted-foreground">
            <span>Table 04 · KOT #128</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Live
            </span>
          </div>
          <ul className="mt-2 space-y-2 text-sm">
            {[
              { q: "2×", name: "Masala Dosa", p: "₹240" },
              { q: "1×", name: "Filter Coffee", p: "₹40" },
              { q: "3×", name: "Idli Plate", p: "₹180" },
            ].map((row) => (
              <li key={row.name} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  <span className="font-mono text-foreground">{row.q}</span>{" "}
                  {row.name}
                </span>
                <span className="font-medium">{row.p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Total</span>
            <span className="text-primary">₹460</span>
          </div>
        </div>
      </div>
    </div>
  );
}
