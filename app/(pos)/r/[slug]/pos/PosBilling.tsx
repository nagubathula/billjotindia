"use client";

// Counter POS billing screen.
//
// Scope:
//   - Tap product → add to bill at base price. has_addons products open a
//     ModifierDialog so the cashier can pick options before adding.
//   - Adjust qty inline, remove line.
//   - Subtotal, GST (per-line gst_rate × qty × unit price), total.
//   - Tender: Cash / UPI / Card → POST /api/orders with source='pos' → receipt.
//   - Fullscreen toggle, outlet switcher.
//
// TODO (next iterations):
//   - Keyboard shortcuts (cashiers want a keypad, not a mouse).
//   - Discount + rounding controls, split tender, hold/recall bills.
//   - Inter-state IGST when outlet.state_code !== customer state.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Receipt,
  Search,
  Settings2,
  ShoppingBag,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { ModifierDialog } from "@/components/ModifierDialog";
import type { SelectedOption } from "@/components/CartProvider";
import type { Category, Outlet, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { setSelectedOutletAction } from "./actions";
import {
  listTabsAction,
  createTabAction,
  saveTabAction,
  deleteTabAction,
} from "./tab-actions";

type Line = {
  configKey: string;
  product: Product;
  qty: number;
  selectedOptions: SelectedOption[];
  unitPrice: number;
};

type Tender = "cash" | "upi" | "card";

// A "tab" is an open running bill — like a bar tab the customer settles later.
// The default "Counter" tab behaves like a normal quick sale.
type Tab = {
  id: string;
  name: string;
  lines: Line[];
  createdAt: number;
  // Named tabs are persisted to the DB (shared across terminals). The default
  // "Counter" tab is a local-only quick sale.
  persisted?: boolean;
};

const DEFAULT_TAB_ID = "counter";
function makeDefaultTab(): Tab {
  return { id: DEFAULT_TAB_ID, name: "Counter", lines: [], createdAt: 0, persisted: false };
}

type Props = {
  outlet: Outlet;
  outlets: Outlet[];
  categories: Category[];
  products: Product[];
  restaurantSlug: string;
  restaurantName: string;
  staffEmail: string;
  staffRoleLabel: string;
};

function buildConfigKey(productId: number, options: SelectedOption[]): string {
  if (options.length === 0) return `p${productId}`;
  const ids = options.map((o) => o.option_id).sort((a, b) => a - b);
  return `p${productId}:${ids.join("-")}`;
}

export function PosBilling({
  outlet,
  outlets,
  categories,
  products,
  restaurantSlug,
  restaurantName,
  staffEmail,
  staffRoleLabel,
}: Props) {
  const router = useRouter();
  const outletId = outlet.id;
  const [switchingOutlet, startOutletSwitch] = useTransition();

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>(() => [makeDefaultTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_ID);
  const [creatingTab, setCreatingTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [posting, setPosting] = useState<Tender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modProduct, setModProduct] = useState<Product | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const lines = activeTab?.lines ?? [];
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load this outlet's open tabs from the DB (shared across terminals). The
  // walk-in "Counter" tab is local-only — a transient quick sale.
  useEffect(() => {
    let cancelled = false;
    setTabs([makeDefaultTab()]);
    setActiveTabId(DEFAULT_TAB_ID);
    listTabsAction(restaurantSlug, outletId)
      .then((dbTabs) => {
        if (cancelled || dbTabs.length === 0) return;
        const mapped: Tab[] = dbTabs.map((t) => ({
          id: t.id,
          name: t.name,
          lines: (t.lines as Line[]) ?? [],
          createdAt: t.createdAt,
          persisted: true,
        }));
        setTabs([makeDefaultTab(), ...mapped]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, outletId]);

  // Debounced persistence for a named (DB-backed) tab.
  const scheduleSave = (tab: Tab) => {
    if (!tab.persisted) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot = { id: tab.id, name: tab.name, lines: tab.lines };
    saveTimer.current = setTimeout(() => {
      saveTabAction(
        restaurantSlug,
        snapshot.id,
        snapshot.name,
        snapshot.lines,
      ).catch(() => {});
    }, 700);
  };

  const updateActiveLines = (updater: (prev: Line[]) => Line[]) => {
    setTabs((prev) => {
      const next = prev.map((t) =>
        t.id === activeTabId ? { ...t, lines: updater(t.lines) } : t,
      );
      const active = next.find((t) => t.id === activeTabId);
      if (active) scheduleSave(active);
      return next;
    });
  };

  const createTab = async () => {
    const name = newTabName.trim() || `Tab ${tabs.length}`;
    setNewTabName("");
    setCreatingTab(false);
    const res = await createTabAction(restaurantSlug, outletId, name);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTabs((prev) => [
      ...prev,
      { id: res.tab.id, name: res.tab.name, lines: [], createdAt: res.tab.createdAt, persisted: true },
    ]);
    setActiveTabId(res.tab.id);
  };

  const closeTab = async (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (tab && tab.lines.length > 0 && !confirm(`Discard tab "${tab.name}"?`)) {
      return;
    }
    const remaining = tabs.filter((t) => t.id !== id);
    const next = remaining.length > 0 ? remaining : [makeDefaultTab()];
    setTabs(next);
    if (id === activeTabId) setActiveTabId(next[0].id);
    if (tab?.persisted) await deleteTabAction(restaurantSlug, id).catch(() => {});
  };

  const visibleCategories = useMemo(() => {
    const withItems = new Set(products.map((p) => p.category));
    return categories.filter((c) => withItems.has(c.name));
  }, [categories, products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory && p.category !== activeCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, activeCategory, search]);

  const addLine = (product: Product, selectedOptions: SelectedOption[] = []) => {
    updateActiveLines((prev) => {
      const configKey = buildConfigKey(product.id, selectedOptions);
      const existing = prev.find((l) => l.configKey === configKey);
      if (existing) {
        return prev.map((l) =>
          l.configKey === configKey ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      const unitPrice =
        Number(product.price) +
        selectedOptions.reduce((s, o) => s + Number(o.price), 0);
      return [
        ...prev,
        { configKey, product, qty: 1, selectedOptions, unitPrice },
      ];
    });
  };

  const handleProductClick = (product: Product) => {
    if (product.has_addons) {
      setModProduct(product);
    } else {
      addLine(product);
    }
  };

  const setQty = (configKey: string, qty: number) => {
    updateActiveLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.configKey !== configKey)
        : prev.map((l) => (l.configKey === configKey ? { ...l, qty } : l)),
    );
  };

  // GST-inclusive pricing (typical Indian QSR). Compute implicit GST per line
  // using unitPrice (which already includes any modifier surcharges).
  const totals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    for (const { product, qty, unitPrice } of lines) {
      const line = unitPrice * qty;
      subtotal += line;
      const rate = Number(product.gst_rate ?? 5) / 100;
      gst += line - line / (1 + rate);
    }
    return {
      subtotal,
      taxable: subtotal - gst,
      cgst: gst / 2,
      sgst: gst / 2,
      gst,
      total: subtotal,
    };
  }, [lines]);

  const tender = async (mode: Tender) => {
    if (lines.length === 0 || posting) return;
    setPosting(mode);
    setError(null);

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          source: "pos",
          customer_name: activeTab?.name || "Counter",
          customer_email: `pos+${mode}@billjot.local`,
          order_type: "takeaway",
          subtotal: Number(totals.taxable.toFixed(2)),
          takeaway_charges: 0,
          total_amount: Number(totals.total.toFixed(2)),
          items: lines.map((l) => ({
            quantity: l.qty,
            unit_price: l.unitPrice,
            total_price: Number((l.unitPrice * l.qty).toFixed(2)),
            product_config: {
              product_id: l.product.id,
              name: l.product.name,
              base_price: Number(l.product.price),
              selected_options: l.selectedOptions,
              gst_rate: Number(l.product.gst_rate ?? 5),
              hsn_code: l.product.hsn_code,
              tender_mode: mode,
            },
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Order failed");

      // Settled — drop this tab. Delete the DB-backed tab so it doesn't
      // reappear on this or any other terminal.
      const settledId = activeTabId;
      const wasPersisted = activeTab?.persisted;
      const remaining = tabs.filter((t) => t.id !== settledId);
      const next = remaining.length > 0 ? remaining : [makeDefaultTab()];
      setTabs(next);
      setActiveTabId(next[0].id);
      if (wasPersisted) {
        deleteTabAction(restaurantSlug, settledId).catch(() => {});
      }

      router.push(`/r/${restaurantSlug}/pos/receipt/${json.order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
      setPosting(null);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b bg-background px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{restaurantName}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {outlet.gstin && <span>GSTIN {outlet.gstin}</span>}
            <span>·</span>
            <span>
              {staffRoleLabel} · {staffEmail}
            </span>
          </div>
        </div>

        {outlets.length > 1 ? (
          <Select
            value={String(outletId)}
            disabled={switchingOutlet}
            onValueChange={(v) => {
              if (!v) return;
              startOutletSwitch(async () => {
                await setSelectedOutletAction(restaurantSlug, Number(v));
                router.refresh();
              });
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {outlets.map((o) => (
                <SelectItem key={o.id} value={String(o.id)}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="font-normal">
            {outlet.name}
          </Badge>
        )}

        <div className="relative ml-auto w-72">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, code or SKU…"
            className="pl-8"
            autoFocus
          />
        </div>

        <FullscreenToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: catalogue */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* Category tabs */}
          <div className="flex gap-1 overflow-x-auto border-b bg-background px-2 py-2">
            <Button
              variant={activeCategory === null ? "default" : "secondary"}
              size="sm"
              onClick={() => setActiveCategory(null)}
            >
              All
            </Button>
            {visibleCategories.map((c) => (
              <Button
                key={c.id}
                variant={activeCategory === c.name ? "default" : "secondary"}
                size="sm"
                onClick={() => setActiveCategory(c.name)}
                className="shrink-0"
              >
                {c.emoji ? `${c.emoji} ` : ""}
                {c.name}
              </Button>
            ))}
          </div>

          {/* Product grid */}
          <div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-y-auto p-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredProducts.length === 0 && (
              <div className="col-span-full flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
                <ShoppingBag className="h-8 w-8 opacity-40" />
                <p>{search ? "No items match." : "No products in this outlet yet."}</p>
                {!search && (
                  <p className="text-xs">
                    Ask an admin to add products in the Menu section.
                  </p>
                )}
              </div>
            )}
            {filteredProducts.map((p) => {
              const isVeg = (p.veg_status ?? "Veg").toLowerCase() === "veg";
              return (
                <button
                  key={p.id}
                  onClick={() => handleProductClick(p)}
                  className="group flex flex-col items-start gap-1.5 rounded-xl border bg-card p-2.5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
                >
                  <div className="flex w-full items-center gap-1">
                    <span
                      aria-label={isVeg ? "Veg" : "Non-veg"}
                      className={`h-2.5 w-2.5 rounded-sm border ${
                        isVeg
                          ? "border-emerald-700 bg-emerald-500"
                          : "border-red-700 bg-red-500"
                      }`}
                    />
                    {p.has_addons && (
                      <Settings2
                        className="h-3 w-3 text-muted-foreground"
                        aria-label="Has modifiers"
                      />
                    )}
                    {p.code && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {p.code}
                      </span>
                    )}
                  </div>
                  <span className="line-clamp-2 text-sm font-medium leading-tight">
                    {p.name}
                  </span>
                  <span className="text-base font-semibold text-primary">
                    ₹{Number(p.price).toFixed(0)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right: bill */}
        <aside className="flex w-96 shrink-0 flex-col border-l bg-background">
          {/* Tabs strip — open bar tabs the customer settles later */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b bg-muted/30 px-2 py-2">
            {tabs.map((t) => {
              const count = t.lines.reduce((s, l) => s + l.qty, 0);
              const isActive = t.id === activeTabId;
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  <button
                    onClick={() => setActiveTabId(t.id)}
                    className="flex items-center gap-1.5 font-medium"
                  >
                    {t.name}
                    {count > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] tabular-nums",
                          isActive ? "bg-primary-foreground/20" : "bg-muted",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                  {t.id !== DEFAULT_TAB_ID && (
                    <button
                      onClick={() => closeTab(t.id)}
                      className="opacity-60 transition hover:opacity-100"
                      aria-label={`Close ${t.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {creatingTab ? (
              <input
                autoFocus
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createTab();
                  if (e.key === "Escape") {
                    setCreatingTab(false);
                    setNewTabName("");
                  }
                }}
                onBlur={() => {
                  if (newTabName.trim()) createTab();
                  else setCreatingTab(false);
                }}
                placeholder="Name… e.g. Table 4"
                className="h-7 w-36 shrink-0 rounded-full border border-primary bg-background px-3 text-xs outline-none placeholder:text-muted-foreground"
              />
            ) : (
              <button
                onClick={() => setCreatingTab(true)}
                className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                <Plus className="h-3 w-3" /> Tab
              </button>
            )}
          </div>

          <div className="flex items-center justify-between border-b px-3 py-2 text-sm">
            <span className="truncate font-semibold">
              {activeTab?.name ?? "Current bill"}
            </span>
            {lines.length > 0 && (
              <Badge variant="secondary" className="shrink-0">
                {lines.reduce((s, l) => s + l.qty, 0)} items
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {lines.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
                <Receipt className="h-8 w-8 opacity-40" />
                <p>Tap an item to start a bill.</p>
              </div>
            )}
            {lines.map(({ configKey, product, qty, selectedOptions, unitPrice }) => (
              <div
                key={configKey}
                className="flex items-center gap-2 border-b px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{product.name}</div>
                  {selectedOptions.length > 0 && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {selectedOptions.map((o) => o.option_name).join(" · ")}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    ₹{unitPrice.toFixed(0)} × {qty}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setQty(configKey, qty - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setQty(configKey, qty + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="w-16 text-right text-sm font-semibold tabular-nums">
                  ₹{(unitPrice * qty).toFixed(0)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals + tender */}
          <div className="border-t bg-muted/20 p-3">
            <Row label="Taxable" value={totals.taxable} />
            <Row label="CGST" value={totals.cgst} />
            <Row label="SGST" value={totals.sgst} />
            <Separator className="my-2" />
            <Row label="Total" value={totals.total} bold large />

            {error && (
              <p
                role="alert"
                className="mt-2 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
              <TenderButton
                label="Cash"
                icon={Banknote}
                onClick={() => tender("cash")}
                disabled={lines.length === 0 || posting !== null}
                loading={posting === "cash"}
              />
              <TenderButton
                label="UPI"
                icon={Smartphone}
                onClick={() => tender("upi")}
                disabled={lines.length === 0 || posting !== null}
                loading={posting === "upi"}
              />
              <TenderButton
                label="Card"
                icon={CreditCard}
                onClick={() => tender("card")}
                disabled={lines.length === 0 || posting !== null}
                loading={posting === "card"}
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateActiveLines(() => [])}
              disabled={lines.length === 0 || posting !== null}
              className="mt-1 w-full text-muted-foreground"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Clear bill
            </Button>
          </div>
        </aside>
      </div>

      {/* Modifier dialog for has_addons products */}
      <ModifierDialog
        product={modProduct}
        open={modProduct !== null}
        onOpenChange={(o) => {
          if (!o) setModProduct(null);
        }}
        onConfirm={(opts) => {
          if (modProduct) addLine(modProduct, opts);
          setModProduct(null);
        }}
      />
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  large,
}: {
  label: string;
  value: number;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${large ? "text-base" : "text-sm"} ${
        bold ? "font-semibold" : ""
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">₹{value.toFixed(2)}</span>
    </div>
  );
}

function TenderButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className="flex h-16 flex-col gap-1 text-sm font-semibold"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}
