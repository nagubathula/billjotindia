"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  BellRing,
  ChefHat,
  CookingPot,
  Check,
  X,
  Timer,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { CancelOrderDialog } from "@/components/CancelOrderDialog";
import { useOrderBell } from "@/components/useOrderBell";
import { cn } from "@/lib/utils";
import { isAggregatorSource } from "@/lib/channels";
import { createClient } from "@/lib/supabase/client";
import { updateOrderStatusAction } from "@/app/r/[slug]/admin/orders/[id]/actions";
import type { Order, OrderItem, OrderStatus, ProductConfig } from "@/lib/types";

type KitchenOrder = Order & { items: OrderItem[] };

// Polling cadence — a safety net. When Supabase Realtime is enabled on the
// `orders` table the board also updates instantly via the subscription below.
const REFRESH_MS = 15000;

const COLUMNS: {
  key: "new" | "preparing" | "ready";
  title: string;
  statuses: OrderStatus[];
  icon: React.ComponentType<{ className?: string }>;
  next: OrderStatus;
  cta: string;
}[] = [
  {
    key: "new",
    title: "New",
    statuses: ["pending", "confirmed"],
    icon: ChefHat,
    next: "preparing",
    cta: "Start cooking",
  },
  {
    key: "preparing",
    title: "Preparing",
    statuses: ["preparing"],
    icon: CookingPot,
    next: "ready",
    cta: "Mark ready",
  },
  {
    key: "ready",
    title: "Ready",
    statuses: ["ready"],
    icon: Check,
    next: "completed",
    cta: "Picked up",
  },
];

const configOf = (it: OrderItem) =>
  it.product_config as unknown as ProductConfig | null;

export function KitchenBoard({
  slug,
  orders,
}: {
  slug: string;
  orders: KitchenOrder[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<KitchenOrder | null>(null);
  const bell = useOrderBell(orders);

  // Tick for elapsed-time display (client-only to avoid hydration mismatch).
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Auto-pull new orders from the server (fallback safety net).
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  // Instant updates via Supabase Realtime (no-op until the `orders` table is
  // added to the supabase_realtime publication — see scripts/enable-realtime.sql).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  function bump(orderId: string, status: OrderStatus) {
    setBusyId(orderId);
    start(async () => {
      const res = await updateOrderStatusAction(slug, orderId, status);
      if (!res.ok) alert(res.error);
      router.refresh();
      setBusyId(null);
    });
  }

  function elapsed(placedAt: string | null) {
    if (!now || !placedAt) return null;
    const mins = Math.max(0, Math.floor((now - new Date(placedAt).getTime()) / 60000));
    return mins;
  }

  const BellIcon = !bell.enabled ? BellOff : bell.unanswered.size > 0 ? BellRing : Bell;
  const bellLabel = !bell.enabled
    ? "Sound off"
    : bell.blocked
      ? "Tap to allow sound"
      : "Sound on";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {orders.length} active{" "}
          {orders.length === 1 ? "ticket" : "tickets"} · auto-refreshing
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={bell.toggle}
            aria-pressed={bell.enabled}
            title={
              bell.enabled
                ? "New orders ring until they're accepted. Click to mute."
                : "Ring when a new order arrives"
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition",
              !bell.enabled && "border-border text-muted-foreground hover:bg-muted",
              bell.enabled && !bell.blocked && "border-primary/30 bg-primary/10 text-primary",
              bell.enabled && bell.blocked && "border-amber-500/40 bg-amber-500/10 text-amber-700",
            )}
          >
            <BellIcon
              className={cn(
                "h-3.5 w-3.5",
                bell.enabled && bell.unanswered.size > 0 && "animate-pulse",
              )}
            />
            {bellLabel}
          </button>
          <button
            onClick={() => router.refresh()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {orders.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <EmptyState
            icon={ChefHat}
            title="No active tickets"
            description="New orders from the POS, storefront and delivery platforms appear here automatically."
          />
        </div>
      )}

      {orders.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => {
            const colOrders = orders.filter((o) =>
              col.statuses.includes((o.status ?? "pending") as OrderStatus),
            );
            return (
              <div key={col.key} className="rounded-2xl border border-border bg-muted/30 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2 font-semibold">
                    <col.icon className="h-4 w-4 text-primary" />
                    {col.title}
                  </div>
                  <Badge variant="secondary">{colOrders.length}</Badge>
                </div>

                <div className="space-y-3">
                  {colOrders.length === 0 && (
                    <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                      Nothing here.
                    </p>
                  )}
                  {colOrders.map((o) => {
                    const mins = elapsed(o.placed_at);
                    const late = mins != null && mins >= 15;
                    const isPending = (o.status ?? "pending") === "pending";
                    // A platform order has to be accepted before cooking starts;
                    // our own orders go straight to the stove.
                    const needsAccept = isPending && isAggregatorSource(o.source);
                    const next = needsAccept ? "confirmed" : col.next;
                    const cta = needsAccept ? "Accept order" : col.cta;
                    const waiting = bell.unanswered.has(o.id);
                    return (
                      <div
                        key={o.id}
                        className={cn(
                          "rounded-xl border border-border bg-card p-3 shadow-sm",
                          waiting && "ring-2 ring-primary",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold">
                            {o.unique_order_id ?? `#${o.id}`}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {waiting && (
                              <Badge className="text-[10px] uppercase">New</Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {o.source}
                            </Badge>
                            {mins != null && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                  late
                                    ? "bg-rose-500/10 text-rose-600"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                <Timer className="h-3 w-3" />
                                {mins}m
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {o.order_type} · {o.customer_name}
                        </div>

                        <ul className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
                          {o.items.map((it) => {
                            const cfg = configOf(it);
                            return (
                              <li key={it.id} className="leading-tight">
                                <span className="font-semibold text-primary">
                                  {it.quantity}×
                                </span>{" "}
                                {cfg?.name ?? `#${cfg?.product_id ?? it.id}`}
                                {cfg?.selected_options?.length ? (
                                  <span className="block pl-5 text-[11px] text-muted-foreground">
                                    {cfg.selected_options
                                      .map((s) => s.option_name)
                                      .join(" · ")}
                                  </span>
                                ) : null}
                                {it.instructions && (
                                  <span className="block pl-5 text-[11px] font-medium text-amber-700">
                                    Note: {it.instructions}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>

                        {o.instructions && (
                          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-amber-500/10 px-2 py-1.5 text-xs font-medium text-amber-800">
                            {o.instructions}
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => bump(o.id, next)}
                            disabled={pending && busyId === o.id}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                          >
                            {pending && busyId === o.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                {cta}
                                <Check className="h-4 w-4" />
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setCancelTarget(o)}
                            disabled={pending && busyId === o.id}
                            title={isPending ? "Reject order" : "Cancel order"}
                            aria-label={isPending ? "Reject order" : "Cancel order"}
                            className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cancelTarget && (
        <CancelOrderDialog
          slug={slug}
          orderId={cancelTarget.id}
          orderLabel={cancelTarget.unique_order_id ?? `#${cancelTarget.id}`}
          lines={cancelTarget.items.map((it) => {
            const cfg = configOf(it);
            return { productId: cfg?.product_id ?? null, name: cfg?.name ?? "Item" };
          })}
          verb={(cancelTarget.status ?? "pending") === "pending" ? "reject" : "cancel"}
          open
          onOpenChange={(open) => {
            if (!open) setCancelTarget(null);
          }}
          onDone={() => router.refresh()}
        />
      )}
    </div>
  );
}
