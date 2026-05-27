import Link from "next/link";
import { ArrowRight, LayoutDashboard, Receipt, Store, Zap } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold text-primary">Billjot</span>
        <nav className="flex items-center gap-2 text-sm">
          {user ? (
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <LayoutDashboard className="mr-1 h-3 w-3" /> Dashboard
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
      </header>

      <section className="mt-20 space-y-6 text-center">
        <h1 className="mx-auto max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          A POS + online ordering platform for Indian F&B.
        </h1>
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Counter billing, kitchen tickets, customer ordering, multi-outlet,
          multi-brand — built for restaurants that want to take on Petpooja's
          turf.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          {user ? (
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              Open your dashboard <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Create your restaurant <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                I already have an account
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="mt-24 grid gap-6 sm:grid-cols-3">
        <Feature
          icon={Receipt}
          title="Counter POS + KOT"
          body="GST-compliant billing, thermal-print receipts, kitchen tickets routed by station."
        />
        <Feature
          icon={Store}
          title="Multi-outlet & multi-brand"
          body="Run several branches under one menu library. Group franchises under a brand."
        />
        <Feature
          icon={Zap}
          title="Aggregator-ready"
          body="Schema for Zomato / Swiggy / ONDC integrations. Wire up when you're approved as a POS partner."
        />
      </section>

      <footer className="mt-24 border-t pt-6 text-center text-xs text-muted-foreground">
        Made for Indian restaurants. ·{" "}
        <Link href="/signup" className="underline">
          Start your free restaurant
        </Link>
      </footer>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="space-y-1.5">
      <Icon className="h-5 w-5 text-primary" />
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
