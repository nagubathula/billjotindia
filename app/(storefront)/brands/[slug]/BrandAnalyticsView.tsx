"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BarChart3,
  Building2,
  ChefHat,
  IndianRupee,
  MapPin,
  Plus,
  Receipt,
  ReceiptText,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Brand, Restaurant } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AttachRestaurantForm } from "./AttachRestaurantForm";
import { DetachButton } from "./DetachButton";

export type BrandRange = "today" | "yesterday" | "7d" | "30d";

const RANGE_LABEL: Record<BrandRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

const PREV_LABEL: Record<BrandRange, string> = {
  today: "vs yesterday",
  yesterday: "vs prev day",
  "7d": "vs prev 7 days",
  "30d": "vs prev 30 days",
};

export type BrandRestaurantStatRow = {
  restaurantId: string;
  name: string;
  slug: string;
  outletsCount: number;
  orders: number;
  openTables: number;
  revenue: number;
  gst: number;
  liveQueue: number;
  canOpenRestAdmin: boolean;
  canOpenRestPos: boolean;
  canDetach: boolean;
};

export type BrandRangeSnapshot = {
  totalBrandOrders: number;
  totalBrandRevenue: number;
  totalBrandGst: number;
  prevOrders: number;
  prevRevenue: number;
  periodExpensesTotal: number;
  isHourly: boolean;
  series: Array<{ label: string; value: number }>;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  sources: Array<{ source: string; count: number; revenue: number }>;
  types: Array<{ orderType: string; count: number; revenue: number }>;
  rankedRestaurants: BrandRestaurantStatRow[];
};

export type BrandWorkingCapital = {
  totalCorpReceivable: number;
  openCorpInvoicesCount: number;
  totalTabReceivable: number;
  activeTabAccountsCount: number;
  totalVendorPayables: number;
  activeStaffCount: number;
};

function formatINR(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatINRExact(n: number) {
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function deltaPct(cur: number, prev: number): number | null {
  return prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
}

export function BrandAnalyticsView({
  brand,
  isOwner,
  initialRange,
  restaurantsCount,
  outletsCount,
  totalBrandLiveQueue,
  workingCapital,
  attachable,
  ranges,
}: {
  brand: Brand;
  isOwner: boolean;
  initialRange: BrandRange;
  restaurantsCount: number;
  outletsCount: number;
  totalBrandLiveQueue: number;
  workingCapital: BrandWorkingCapital;
  attachable: Restaurant[];
  ranges: Record<BrandRange, BrandRangeSnapshot>;
}) {
  const [validRange, setValidRange] = useState<BrandRange>(initialRange);
  const snap = ranges[validRange] ?? ranges["7d"];

  function selectRange(next: BrandRange) {
    setValidRange(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `/brands/${brand.slug}?range=${next}`,
      );
    }
  }

  const brandAov =
    snap.totalBrandOrders > 0 ? snap.totalBrandRevenue / snap.totalBrandOrders : 0;
  const prevAov =
    snap.prevOrders > 0 ? snap.prevRevenue / snap.prevOrders : 0;
  const seriesMax = Math.max(...snap.series.map((s) => s.value), 1);
  const labelEvery = Math.max(1, Math.ceil(snap.series.length / 8));
  const topMaxQty = Math.max(...snap.topProducts.map((p) => p.qty), 1);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                {brand.name}
              </h1>
              <Badge variant="secondary">Franchise HQ</Badge>
              <Badge variant="outline" className="text-[11px]">
                {isOwner ? "Brand Owner" : "Franchise Admin"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Consolidated multi-restaurant reports, GST roll-up &amp; live
              operations ({RANGE_LABEL[validRange]})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <nav className="inline-flex items-center rounded-[10px] bg-muted p-0.5">
            {(["today", "yesterday", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => selectRange(r)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                  r === validRange
                    ? "bg-card text-foreground shadow-control"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </nav>

          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            ← All Workspaces
          </Link>
        </div>
      </header>

      {/* Consolidated Brand Roll-Up KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <BrandStat
          icon={IndianRupee}
          label="Brand revenue"
          value={formatINR(snap.totalBrandRevenue)}
          deltaPct={deltaPct(snap.totalBrandRevenue, snap.prevRevenue)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <BrandStat
          icon={ReceiptText}
          label="Settled orders"
          value={String(snap.totalBrandOrders)}
          deltaPct={deltaPct(snap.totalBrandOrders, snap.prevOrders)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <BrandStat
          icon={TrendingUp}
          label="Brand avg. order"
          value={snap.totalBrandOrders ? formatINR(brandAov) : "—"}
          deltaPct={deltaPct(brandAov, prevAov)}
          deltaLabel={PREV_LABEL[validRange]}
        />
        <BrandStat
          icon={Receipt}
          label="Brand GST payable"
          value={formatINR(snap.totalBrandGst)}
          sub={`CGST ${formatINR(snap.totalBrandGst / 2)} · SGST ${formatINR(snap.totalBrandGst / 2)}`}
        />
        <BrandStat
          icon={ChefHat}
          label="Live kitchen queue"
          value={String(totalBrandLiveQueue)}
          sub={`${restaurantsCount} restaurants · ${outletsCount} outlets`}
        />
      </section>

      {/* Brand Operations & Working Capital Roll-Up */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BrandStat
          icon={Building2}
          label="Corporate B2B receivable"
          value={formatINR(workingCapital.totalCorpReceivable)}
          sub={`${workingCapital.openCorpInvoicesCount} unpaid/partial GST invoices`}
        />
        <BrandStat
          icon={Users}
          label="People's Tabs (Khata)"
          value={formatINR(workingCapital.totalTabReceivable)}
          sub={`${workingCapital.activeTabAccountsCount} active credit accounts`}
        />
        <BrandStat
          icon={Truck}
          label="Vendor PO payables"
          value={formatINR(workingCapital.totalVendorPayables)}
          sub="Outstanding across supplier POs"
        />
        <BrandStat
          icon={Wallet}
          label={`Staff & expenses (${RANGE_LABEL[validRange]})`}
          value={formatINR(snap.periodExpensesTotal)}
          sub={`${workingCapital.activeStaffCount} active staff across kitchens`}
        />
      </section>

      {/* Per-Restaurant Performance Comparison Table */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Restaurant comparison · {RANGE_LABEL[validRange]}
            </CardTitle>
            <CardDescription>
              Side-by-side revenue, order volume, GST liability, and live kitchen
              queue across every restaurant in {brand.name}.
            </CardDescription>
          </div>
          <Badge variant="secondary">{restaurantsCount} restaurants</Badge>
        </CardHeader>
        <CardContent className="pt-3">
          {snap.rankedRestaurants.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No restaurants attached yet"
              description="Use the form below to attach a restaurant you admin."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant</TableHead>
                  <TableHead className="text-right">Outlets</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Avg. Order</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Gross Revenue</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Live KDS</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {snap.rankedRestaurants.map((st) => {
                  const sharePct = snap.totalBrandRevenue
                    ? Math.round((st.revenue / snap.totalBrandRevenue) * 100)
                    : 0;
                  const aov = st.orders ? st.revenue / st.orders : 0;

                  return (
                    <TableRow key={st.restaurantId}>
                      <TableCell>
                        <div className="font-semibold text-foreground">
                          {st.name}
                        </div>
                        {st.openTables > 0 && (
                          <div className="text-[11px] text-amber-700">
                            {st.openTables} open{" "}
                            {st.openTables === 1 ? "table" : "tables"} running
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {st.outletsCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {st.orders}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {st.orders ? formatINR(aov) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatINRExact(st.gst)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatINRExact(st.revenue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {sharePct}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {st.liveQueue > 0 ? (
                          <Badge variant="secondary" className="text-[11px]">
                            {st.liveQueue} active
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {st.canOpenRestAdmin && (
                            <Link
                              href={`/r/${st.slug}/admin/reports?range=${validRange}`}
                              className={cn(
                                buttonVariants({
                                  variant: "default",
                                  size: "xs",
                                }),
                              )}
                            >
                              Admin
                            </Link>
                          )}
                          {st.canOpenRestPos && (
                            <Link
                              href={`/r/${st.slug}/pos`}
                              className={cn(
                                buttonVariants({
                                  variant: "outline",
                                  size: "xs",
                                }),
                              )}
                            >
                              POS
                            </Link>
                          )}
                          <Link
                            href={`/r/${st.slug}`}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "xs" }),
                            )}
                          >
                            Storefront ↗
                          </Link>
                          {st.canDetach && (
                            <DetachButton
                              brandId={brand.id}
                              restaurantId={st.restaurantId}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Brand Revenue Trend + Channel/Type Mix */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Brand revenue trend
            </CardTitle>
            <CardDescription>
              {snap.isHourly ? "Hourly breakdown" : "Daily breakdown"} across all
              outlets · {RANGE_LABEL[validRange]}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {snap.totalBrandOrders === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No settled brand sales in this range"
                description="Switch to Last 7 days or Last 30 days to inspect historical brand roll-ups."
              />
            ) : (
              <div>
                <div className="flex h-40 items-end gap-1">
                  {snap.series.map((s, i) => (
                    <div
                      key={i}
                      className="group relative flex h-full flex-1 items-end"
                      title={`${s.label}: ${formatINR(s.value)}`}
                    >
                      <div
                        className="w-full rounded-t bg-primary/85 transition-all group-hover:bg-primary"
                        style={{
                          height: `${Math.max((s.value / seriesMax) * 100, s.value > 0 ? 4 : 1)}%`,
                          opacity: s.value > 0 ? 1 : 0.15,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-1">
                  {snap.series.map((s, i) => (
                    <div
                      key={i}
                      className="flex-1 truncate text-center text-[11px] tabular-nums text-muted-foreground"
                    >
                      {i % labelEvery === 0 ? s.label : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Store className="h-4 w-4 text-muted-foreground" />
                Brand channel mix
              </CardTitle>
              <CardDescription>
                POS vs Direct Storefront vs Delivery platforms.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {snap.sources.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  No orders in this range.
                </p>
              ) : (
                snap.sources.map((src) => {
                  const pct = snap.totalBrandRevenue
                    ? Math.round(
                        (src.revenue / snap.totalBrandRevenue) * 100,
                      )
                    : 0;
                  return (
                    <div key={src.source} className="text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <Badge
                          variant="outline"
                          className="text-[11px] uppercase"
                        >
                          {src.source}
                        </Badge>
                        <span className="tabular-nums text-muted-foreground">
                          {src.count} · {formatINR(src.revenue)} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/80"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Utensils className="h-4 w-4 text-muted-foreground" />
                Order types across brand
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {snap.types.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  No orders in this range.
                </p>
              ) : (
                snap.types.map((t) => {
                  const pct = snap.totalBrandOrders
                    ? Math.round((t.count / snap.totalBrandOrders) * 100)
                    : 0;
                  return (
                    <div key={t.orderType} className="text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium capitalize">
                          {t.orderType}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {t.count} orders · {formatINR(t.revenue)} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/80"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top Selling Dishes Across Brand */}
      <Card>
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            Top selling items across {brand.name}
          </CardTitle>
          <CardDescription>
            Best-performing dishes consolidated across all franchise kitchens (
            {RANGE_LABEL[validRange]}).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-3">
          {snap.topProducts.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No item sales recorded in {RANGE_LABEL[validRange].toLowerCase()}.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {snap.topProducts.map((p, i) => (
                <div
                  key={p.name + i}
                  className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-foreground">
                      <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {p.name}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {p.qty}× · {formatINR(p.revenue)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/80"
                      style={{ width: `${(p.qty / topMaxQty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Attach an independent restaurant
        </h2>
        {attachable.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No independent restaurants available to attach. You can attach
              restaurants where you are admin and which aren&apos;t in another
              brand yet.
              <div className="mt-3">
                <Link
                  href="/signup"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                  )}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Create a new restaurant
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <AttachRestaurantForm
                brandId={brand.id}
                restaurants={attachable}
              />
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

function BrandStat({
  icon: Icon,
  label,
  value,
  deltaPct,
  deltaLabel,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  sub?: string;
}) {
  const up = (deltaPct ?? 0) >= 0;
  return (
    <Card size="sm">
      <CardContent className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        <div className="h-4 text-[11px]">
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
              <span className="text-muted-foreground">{deltaLabel}</span>
            </span>
          ) : sub ? (
            <span className="truncate text-muted-foreground">{sub}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
