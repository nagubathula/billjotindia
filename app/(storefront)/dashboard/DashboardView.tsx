"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChefHat,
  HandPlatter,
  IndianRupee,
  MonitorSmartphone,
  Plus,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Store,
  TrendingDown,
  TrendingUp,
  User as UserIcon,
  UserCog,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { ROLE_LABEL } from "@/lib/roles";
import type { AppRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AnalyticsRange = "today" | "yesterday" | "7d" | "30d";

export const RANGE_LABEL: Record<AnalyticsRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

export const PREV_LABEL: Record<AnalyticsRange, string> = {
  today: "vs yesterday",
  yesterday: "vs prev day",
  "7d": "vs prev 7d",
  "30d": "vs prev 30d",
};

export type DashboardBrandAnalytics = {
  id: string;
  name: string;
  slug: string;
  handle: string;
  isOwner: boolean;
  restaurantCount: number;
  outletsCount: number;
  orders: number;
  revenue: number;
  prevOrders: number;
  prevRevenue: number;
  gst: number;
  liveQueue: number;
  corpReceivable: number;
  tabReceivable: number;
  vendorPayable: number;
  series: Array<{ label: string; value: number }>;
  isHourly: boolean;
  rankedRestaurants: Array<{
    id: string;
    name: string;
    slug: string;
    orders: number;
    revenue: number;
    sharePct: number;
  }>;
  sources: Array<{ source: string; count: number; revenue: number }>;
};

export type DashboardRestaurantCard = {
  id: string;
  name: string;
  slug: string;
  handle: string;
  role: AppRole;
  isOps: boolean;
  parentBrandName: string | null;
  orders: number;
  revenue: number;
  liveQueue: number;
};

export type DashboardRangeSnapshot = {
  portfolioOrders: number;
  portfolioRevenue: number;
  portfolioPrevRevenue: number;
  portfolioGst: number;
  brands: DashboardBrandAnalytics[];
  restaurants: DashboardRestaurantCard[];
};

const ROLE_ICON: Record<AppRole, React.ComponentType<{ className?: string }>> = {
  admin: ShieldCheck,
  manager: UserCog,
  user: UserIcon,
  captain: HandPlatter,
};

const inr = (n: number) =>
  `₹${Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-IN")}`;

function pctDelta(cur: number, prev: number): number | null {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
}

export function DashboardView({
  firstName,
  initialRange,
  hasOpsAnalytics,
  outletsCount,
  restaurantsCount,
  brandsCount,
  portfolioReceivables,
  portfolioPayables,
  portfolioLiveKds,
  accessLevelLabel,
  ranges,
}: {
  firstName: string;
  initialRange: AnalyticsRange;
  hasOpsAnalytics: boolean;
  outletsCount: number;
  restaurantsCount: number;
  brandsCount: number;
  portfolioReceivables: number;
  portfolioPayables: number;
  portfolioLiveKds: number;
  accessLevelLabel: string;
  ranges: Record<AnalyticsRange, DashboardRangeSnapshot>;
}) {
  const [activeRange, setActiveRange] = useState<AnalyticsRange>(initialRange);
  const snap = ranges[activeRange] ?? ranges["7d"];

  function selectRange(next: AnalyticsRange) {
    setActiveRange(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/dashboard?range=${next}`);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Consolidated brand & restaurant performance, receivables, and POS launchers."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasOpsAnalytics && (
              <nav className="inline-flex items-center rounded-[10px] bg-muted p-0.5">
                {(["today", "yesterday", "7d", "30d"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => selectRange(r)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                      r === activeRange
                        ? "bg-card text-foreground shadow-control"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {RANGE_LABEL[r]}
                  </button>
                ))}
              </nav>
            )}
            <Link
              href="/brands/new"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              New brand
            </Link>
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              New restaurant
            </Link>
          </div>
        }
      />

      {/* Executive Portfolio KPI Strip */}
      {hasOpsAnalytics ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label={`Portfolio Revenue (${RANGE_LABEL[activeRange]})`}
            value={inr(snap.portfolioRevenue)}
            sub={`${restaurantsCount} restaurants · ${outletsCount} outlets`}
            deltaPct={pctDelta(
              snap.portfolioRevenue,
              snap.portfolioPrevRevenue,
            )}
            deltaLabel={PREV_LABEL[activeRange]}
            icon={IndianRupee}
          />
          <StatCard
            label="Settled Orders"
            value={snap.portfolioOrders}
            sub={
              snap.portfolioOrders > 0
                ? `Avg ${inr(snap.portfolioRevenue / snap.portfolioOrders)} / order`
                : `No orders in ${RANGE_LABEL[activeRange].toLowerCase()}`
            }
            icon={ReceiptText}
          />
          <StatCard
            label="GST Collected"
            value={inr(snap.portfolioGst)}
            sub={`CGST ${inr(snap.portfolioGst / 2)} · SGST ${inr(snap.portfolioGst / 2)}`}
            icon={Receipt}
          />
          <StatCard
            label="Receivables (B2B + Khata)"
            value={inr(portfolioReceivables)}
            sub="Unpaid corporate invoices & customer tabs"
            icon={Wallet}
          />
          <StatCard
            label="Vendor Payables & KDS"
            value={inr(portfolioPayables)}
            sub={`${portfolioLiveKds} active orders in kitchen`}
            icon={ChefHat}
          />
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Active Restaurants"
            value={restaurantsCount}
            sub="Operational POS & Storefront"
            icon={Store}
          />
          <StatCard
            label="Franchise Brands"
            value={brandsCount}
            sub="Multi-restaurant groups"
            icon={Building2}
          />
          <StatCard
            label="Access Level"
            value={accessLevelLabel}
            sub="POS & Floor operations"
            icon={ShieldCheck}
          />
        </section>
      )}

      {/* Franchise Brand Analytics Section */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Brand Analytics
            </h2>
            <p className="text-xs text-muted-foreground">
              Consolidated roll-up performance across multi-restaurant brands (
              {RANGE_LABEL[activeRange]}).
            </p>
          </div>
        </div>

        {snap.brands.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Building2}
                title="No brands yet"
                description="Group multiple outlets/restaurants into a franchise brand to view side-by-side revenue analytics."
                action={
                  <Link
                    href="/brands/new"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                    )}
                  >
                    Create a brand
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {snap.brands.map((b) => {
              const brandAov = b.orders > 0 ? b.revenue / b.orders : 0;
              const brandDelta = pctDelta(b.revenue, b.prevRevenue);
              const seriesMax = Math.max(...b.series.map((s) => s.value), 1);
              const labelEvery = Math.max(1, Math.ceil(b.series.length / 8));

              return (
                <Card key={b.id}>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <CardTitle className="text-base font-semibold">
                            {b.name}
                          </CardTitle>
                          <Badge variant="outline" className="text-[11px]">
                            {b.isOwner ? "Owner" : "Franchise Admin"}
                          </Badge>
                          <Badge variant="secondary" className="text-[11px]">
                            {b.restaurantCount}{" "}
                            {b.restaurantCount === 1
                              ? "restaurant"
                              : "restaurants"}{" "}
                            · {b.outletsCount} outlets
                          </Badge>
                        </div>
                        <CardDescription className="mt-0.5 font-mono text-[11px]">
                          /brands/{b.handle}
                        </CardDescription>
                      </div>
                    </div>

                    <Link
                      href={`/brands/${b.slug}?range=${activeRange}`}
                      className={cn(
                        buttonVariants({ variant: "default", size: "sm" }),
                      )}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Open Full Brand HQ
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      <MiniMetric
                        label="Brand Revenue"
                        value={inr(b.revenue)}
                        deltaPct={brandDelta}
                        deltaLabel={PREV_LABEL[activeRange]}
                      />
                      <MiniMetric
                        label="Settled Orders"
                        value={String(b.orders)}
                        sub={`${b.liveQueue} live in KDS`}
                      />
                      <MiniMetric
                        label="Avg Order Value"
                        value={b.orders > 0 ? inr(brandAov) : "—"}
                        sub={RANGE_LABEL[activeRange]}
                      />
                      <MiniMetric
                        label="Brand GST"
                        value={inr(b.gst)}
                        sub="CGST + SGST"
                      />
                      <MiniMetric
                        label="B2B & Khata Due"
                        value={inr(b.corpReceivable + b.tabReceivable)}
                        sub={`B2B ${inr(b.corpReceivable)}`}
                      />
                      <MiniMetric
                        label="Vendor Payables"
                        value={inr(b.vendorPayable)}
                        sub="Unpaid supplier POs"
                      />
                    </div>

                    <div className="grid gap-4 lg:grid-cols-12">
                      <div className="rounded-xl border border-border/70 bg-muted/15 p-3.5 lg:col-span-7">
                        <div className="mb-3 flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">
                            Revenue trend ({b.isHourly ? "Hourly" : "Daily"})
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {RANGE_LABEL[activeRange]}
                          </span>
                        </div>
                        {b.orders > 0 ? (
                          <div>
                            <div className="flex h-28 items-end gap-1">
                              {b.series.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="group flex h-full flex-1 items-end"
                                  title={`${s.label}: ${inr(s.value)}`}
                                >
                                  <div
                                    className="w-full rounded-t bg-primary/85 transition-all group-hover:bg-primary"
                                    style={{
                                      height: `${Math.max(
                                        (s.value / seriesMax) * 100,
                                        s.value > 0 ? 5 : 2,
                                      )}%`,
                                      opacity: s.value > 0 ? 1 : 0.15,
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="mt-1.5 flex gap-1">
                              {b.series.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="flex-1 truncate text-center text-[10px] tabular-nums text-muted-foreground"
                                >
                                  {idx % labelEvery === 0 ? s.label : ""}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-28 items-center justify-center text-xs text-muted-foreground">
                            No settled orders in{" "}
                            {RANGE_LABEL[activeRange].toLowerCase()}.
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/70 bg-muted/15 p-3.5 lg:col-span-5">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground">
                              Restaurant revenue share
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {b.rankedRestaurants.length} locations
                            </span>
                          </div>
                          {b.rankedRestaurants.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No restaurants attached to this brand.
                            </p>
                          ) : (
                            <div className="space-y-2.5">
                              {b.rankedRestaurants.map((r) => (
                                <div key={r.id} className="space-y-1 text-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <Link
                                      href={`/r/${r.slug}/admin/reports?range=${activeRange}`}
                                      className="truncate font-medium text-foreground hover:underline"
                                    >
                                      {r.name}
                                    </Link>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">
                                      {r.orders} ·{" "}
                                      <span className="font-semibold text-foreground">
                                        {inr(r.revenue)}
                                      </span>{" "}
                                      ({r.sharePct}%)
                                    </span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-primary/85"
                                      style={{ width: `${r.sharePct}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {b.sources.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
                            <span className="text-[11px] text-muted-foreground">
                              Channels:
                            </span>
                            {b.sources.map((src) => (
                              <Badge
                                key={src.source}
                                variant="outline"
                                className="text-[10px] uppercase tabular-nums"
                              >
                                {src.source} · {inr(src.revenue)}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Restaurants Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Restaurants
            </h2>
            <p className="text-xs text-muted-foreground">
              Launch admin portals, counter POS billing, GST reports, or online storefronts.
            </p>
          </div>
        </div>

        {snap.restaurants.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Store}
                title="No restaurants yet"
                description="Create your first restaurant — it becomes yours, and you become the admin."
                action={
                  <Link
                    href="/signup"
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" }),
                    )}
                  >
                    Create your first restaurant
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {snap.restaurants.map((r) => {
              const RoleIcon = ROLE_ICON[r.role];
              return (
                <Card key={r.id} className="justify-between">
                  <CardHeader className="space-y-2.5 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
                        <Store className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {r.parentBrandName ? (
                          <Badge variant="outline" className="text-[11px]">
                            {r.parentBrandName}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">
                            Independent
                          </Badge>
                        )}
                        <Badge variant="secondary" className="gap-1 text-[11px]">
                          <RoleIcon className="h-3 w-3" />
                          {ROLE_LABEL[r.role]}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <CardTitle className="text-base font-semibold leading-snug">
                        {r.name}
                      </CardTitle>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        /{r.handle}
                      </p>
                    </div>

                    {r.isOps && (
                      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2 text-[11px]">
                        <div>
                          <div className="text-muted-foreground">Revenue</div>
                          <div className="font-semibold tabular-nums">
                            {inr(r.revenue)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Orders</div>
                          <div className="font-semibold tabular-nums">
                            {r.orders}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Live KDS</div>
                          <div className="font-semibold tabular-nums">
                            {r.liveQueue}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardHeader>

                  <CardFooter className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={
                          r.isOps ? `/r/${r.slug}/admin` : `/r/${r.slug}/pos`
                        }
                        className={cn(
                          buttonVariants({ variant: "default", size: "sm" }),
                        )}
                      >
                        {r.isOps ? "Admin Portal" : "Open POS"}
                      </Link>
                      {r.isOps && (
                        <Link
                          href={`/r/${r.slug}/pos`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                          )}
                        >
                          <MonitorSmartphone className="h-3.5 w-3.5" />
                          POS
                        </Link>
                      )}
                      {r.isOps && (
                        <Link
                          href={`/r/${r.slug}/admin/reports?range=${activeRange}`}
                          className={cn(
                            buttonVariants({ variant: "ghost", size: "sm" }),
                          )}
                          title="Open GST & sales reports"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                    <Link
                      href={`/r/${r.slug}`}
                      target="_blank"
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Storefront
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  deltaPct,
  deltaLabel,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <Card size="sm">
      <CardContent className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{label}</span>
          <Icon className="h-3.5 w-3.5 shrink-0" />
        </div>
        <div className="text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {deltaPct !== null && deltaPct !== undefined ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium",
                  up ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {up ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {up ? "+" : ""}
                {deltaPct}%
              </span>
              <span>{deltaLabel}</span>
            </span>
          ) : (
            sub
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
  sub,
  deltaPct,
  deltaLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  deltaPct?: number | null;
  deltaLabel?: string;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
        {deltaPct !== null && deltaPct !== undefined ? (
          <span
            className={cn(
              "font-medium",
              up ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {up ? "+" : ""}
            {deltaPct}% {deltaLabel}
          </span>
        ) : (
          sub ?? ""
        )}
      </div>
    </div>
  );
}
