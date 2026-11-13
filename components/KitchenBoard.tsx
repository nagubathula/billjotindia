"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  BellOff,
  Check,
  ChefHat,
  Clock,
  Printer,
  RefreshCw,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateOrderStatusAction } from "@/app/r/[slug]/admin/orders/[id]/actions";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  KitchenStation,
  Order,
  OrderItem,
  OrderStatus,
  Outlet,
  ProductConfig,
} from "@/lib/types";

export type KitchenOrder = Order & { items: OrderItem[] };

type StageKey = "new" | "preparing" | "ready";

const STAGES: {
  key: StageKey;
  title: string;
  dotClass: string;
  statuses: OrderStatus[];
  nextStatus: OrderStatus;
  ctaLabel: string;
}[] = [
  {
    key: "new",
    title: "New",
    dotClass: "bg-amber-500",
    statuses: ["pending", "confirmed"],
    nextStatus: "preparing",
    ctaLabel: "Start Preparing",
  },
  {
    key: "preparing",
    title: "Preparing",
    dotClass: "bg-blue-500",
    statuses: ["preparing"],
    nextStatus: "ready",
    ctaLabel: "Mark Ready",
  },
  {
    key: "ready",
    title: "Ready for Pickup",
    dotClass: "bg-emerald-500",
    statuses: ["ready"],
    nextStatus: "completed",
    ctaLabel: "Complete",
  },
];

function configOf(item: OrderItem): ProductConfig | null {
  if (!item.product_config || typeof item.product_config !== "object") {
    return null;
  }
  return item.product_config as ProductConfig;
}

function playBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // Ignore audio context restrictions
  }
}

function formatElapsed(mins: number): string {
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getOrderChannelLabel(o: KitchenOrder): string {
  const src = (o.source ?? "pos").toLowerCase();
  if (src === "swiggy") return "Swiggy";
  if (src === "zomato") return "Zomato";
  if (src === "ondc") return "ONDC";
  const t = (o.order_type ?? "dine-in").toLowerCase();
  if (t.includes("take")) return "Takeaway";
  if (t.includes("deliv")) return "Delivery";
  return "Dine-in";
}

export function KitchenBoard({
  slug,
  outlets,
  stations = [],
  productStationMap = {},
  initialOrders,
}: {
  slug: string;
  outlets: Outlet[];
  stations?: KitchenStation[];
  productStationMap?: Record<string, string>;
  initialOrders: KitchenOrder[];
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders);
  const [outletFilter, setOutletFilter] = useState<string>("all");
  const [stationFilter, setStationFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<"all" | StageKey>("all");
  const [soundOn, setSoundOn] = useState<boolean>(false);
  const [now, setNow] = useState<number>(() => Date.now());
  const [pending, start] = useTransition();
  const [cancellingOrder, setCancellingOrder] = useState<KitchenOrder | null>(
    null,
  );
  const prevCountRef = useRef<number>(initialOrders.length);

  useEffect(() => {
    setOrders(initialOrders);
    if (soundOn && initialOrders.length > prevCountRef.current) {
      playBeep();
    }
    prevCountRef.current = initialOrders.length;
  }, [initialOrders, soundOn]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const outletIds = new Set(outlets.map((o) => o.id));
    const channel = supabase
      .channel(`kds-${slug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { outlet_id?: string }
            | undefined;
          if (row?.outlet_id && !outletIds.has(row.outlet_id)) return;
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [slug, outlets, router]);

  const stationNames = useMemo(() => {
    const set = new Set<string>();
    for (const s of stations) set.add(s.name);
    for (const stName of Object.values(productStationMap)) {
      if (stName) set.add(stName);
    }
    return Array.from(set);
  }, [stations, productStationMap]);

  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        if (outletFilter !== "all" && String(o.outlet_id) !== outletFilter) {
          return false;
        }
        return true;
      })
      .map((o) => {
        if (stationFilter === "all") return o;
        const stationItems = o.items.filter((it) => {
          const cfg = configOf(it);
          const pid = cfg?.product_id;
          if (!pid) return true;
          return productStationMap[pid] === stationFilter;
        });
        return { ...o, items: stationItems };
      })
      .filter((o) => o.items.length > 0);
  }, [orders, outletFilter, stationFilter, productStationMap]);

  const stageBuckets = useMemo(() => {
    const map: Record<StageKey, KitchenOrder[]> = {
      new: [],
      preparing: [],
      ready: [],
    };
    for (const o of filtered) {
      const s = (o.status ?? "pending") as OrderStatus;
      const stage = STAGES.find((st) => st.statuses.includes(s));
      if (stage) map[stage.key].push(o);
    }
    return map;
  }, [filtered]);

  function advance(orderId: string, next: OrderStatus) {
    setOrders((prev) =>
      next === "completed"
        ? prev.filter((o) => o.id !== orderId)
        : prev.map((o) => (o.id === orderId ? { ...o, status: next } : o)),
    );
    start(async () => {
      try {
        await updateOrderStatusAction(slug, orderId, next);
      } catch {
        router.refresh();
      }
    });
  }

  function renderCard(o: KitchenOrder, stage: (typeof STAGES)[number]) {
    const placedMs = o.placed_at ? new Date(o.placed_at).getTime() : now;
    const elapsedMins = Math.max(0, Math.floor((now - placedMs) / 60_000));
    const isSlow = elapsedMins >= 20 && stage.key !== "ready";
    const token = o.token_number ?? o.daily_order_number;
    const channelLabel = getOrderChannelLabel(o);

    return (
      <div
        key={o.id}
        className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-sm"
      >
        <div>
          {/* Card Header */}
          <div className="flex items-start justify-between gap-2 pb-3 border-b border-border/60">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-foreground">
                  {token ? `#${token}` : `#${o.id.slice(0, 4).toUpperCase()}`}
                </span>
                <Badge variant="secondary" className="text-[11px] font-medium">
                  {channelLabel}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {o.customer_name || "Walk-in"}
              </p>
            </div>

            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums",
                isSlow
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Clock className="h-3 w-3" />
              {formatElapsed(elapsedMins)}
            </span>
          </div>

          {/* Order-level Note */}
          {o.instructions && (
            <div className="mt-2.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
              Note: {o.instructions}
            </div>
          )}

          {/* Items List */}
          <ul className="my-3 space-y-2.5">
            {o.items.map((it) => {
              const cfg = configOf(it);
              const mods = cfg?.selected_options ?? [];
              return (
                <li key={it.id} className="text-sm">
                  <div className="flex items-baseline gap-2 font-medium text-foreground">
                    <span className="font-mono text-xs font-semibold text-muted-foreground tabular-nums">
                      {it.quantity}×
                    </span>
                    <span className="leading-snug">{cfg?.name ?? "Item"}</span>
                  </div>
                  {mods.length > 0 && (
                    <p className="pl-6 text-xs text-muted-foreground">
                      {mods.map((m) => m.option_name).join(", ")}
                    </p>
                  )}
                  {it.instructions && (
                    <p className="pl-6 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Note: {it.instructions}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center gap-1.5 pt-3 border-t border-border/60">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => advance(o.id, stage.nextStatus)}
            className="flex-1"
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />
            {stage.ctaLabel}
          </Button>
          <Link
            href={`/r/${slug}/pos/receipt/${o.id}?mode=kot`}
            target="_blank"
            title="Print KOT"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Printer className="h-3.5 w-3.5" />
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            onClick={() => setCancellingOrder(o)}
            title="Cancel order"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Single Clean Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setStageFilter("all")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              stageFilter === "all"
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All ({filtered.length})
          </button>
          {STAGES.map((st) => {
            const count = stageBuckets[st.key].length;
            return (
              <button
                key={st.key}
                type="button"
                onClick={() => setStageFilter(st.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  stageFilter === st.key
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", st.dotClass)} />
                {st.title} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {stationNames.length > 0 && (
            <Select
              value={stationFilter}
              onValueChange={(v) => v && setStationFilter(v)}
            >
              <SelectTrigger size="sm" className="w-44 text-xs">
                <SelectValue placeholder="All stations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stations</SelectItem>
                {stationNames.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {outlets.length > 1 && (
            <Select
              value={outletFilter}
              onValueChange={(v) => v && setOutletFilter(v)}
            >
              <SelectTrigger size="sm" className="w-44 text-xs">
                <SelectValue placeholder="All outlets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outlets</SelectItem>
                {outlets.map((o) => (
                  <SelectItem key={o.id} value={String(o.id)}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setSoundOn((v) => !v)}
            title={soundOn ? "Mute sound" : "Enable sound alert"}
          >
            {soundOn ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => router.refresh()}
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <ChefHat className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            Kitchen queue is clear
          </p>
          <p className="text-xs text-muted-foreground">
            New orders from POS, storefront, and aggregators appear here automatically.
          </p>
        </div>
      ) : stageFilter === "all" ? (
        /* 3-Column Stage Board */
        <div className="grid gap-5 lg:grid-cols-3">
          {STAGES.map((stage) => {
            const list = stageBuckets[stage.key];
            return (
              <div
                key={stage.key}
                className="flex flex-col rounded-xl border border-border bg-muted/20 p-3.5"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", stage.dotClass)} />
                    <h2 className="text-sm font-semibold text-foreground">
                      {stage.title}
                    </h2>
                  </div>
                  <Badge variant="secondary" className="tabular-nums">
                    {list.length}
                  </Badge>
                </div>

                {list.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 py-12 text-xs text-muted-foreground">
                    No {stage.title.toLowerCase()} orders
                  </div>
                ) : (
                  <div className="space-y-3">
                    {list.map((o) => renderCard(o, stage))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Focused Single-Stage Grid */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stageBuckets[stageFilter].map((o) => {
            const st = STAGES.find((s) => s.key === stageFilter)!;
            return renderCard(o, st);
          })}
        </div>
      )}

      {cancellingOrder && (
        <CancelOrderDialog
          slug={slug}
          orderId={cancellingOrder.id}
          orderLabel={
            cancellingOrder.token_number
              ? `#${cancellingOrder.token_number}`
              : `#${cancellingOrder.id.slice(0, 4).toUpperCase()}`
          }
          lines={cancellingOrder.items.map((it) => {
            const cfg = configOf(it);
            return {
              productId: cfg?.product_id ?? null,
              name: cfg?.name ?? "Item",
            };
          })}
          verb={cancellingOrder.status === "pending" ? "reject" : "cancel"}
          open={true}
          onOpenChange={(open) => {
            if (!open) setCancellingOrder(null);
          }}
          onDone={() => {
            const id = cancellingOrder.id;
            setCancellingOrder(null);
            setOrders((prev) => prev.filter((o) => o.id !== id));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
