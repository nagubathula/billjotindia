"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Banknote,
  Bike,
  Check,
  ChefHat,
  Copy,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LayoutGrid,
  Loader2,
  MessageSquarePlus,
  Minus,
  Package,
  Plus,
  QrCode,
  Receipt,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { ModifierDialog } from "@/components/ModifierDialog";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import type { SelectedOption } from "@/components/CartProvider";
import type { PublicPaymentConfig } from "@/lib/payments";
import type { Category, OrderType, Outlet, Product } from "@/lib/types";
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
  instructions?: string;
};

type Tender = "cash" | "upi" | "card";
type VegFilter = "all" | "veg" | "non-veg";

type Tab = {
  id: string;
  name: string;
  lines: Line[];
  orderType?: OrderType;
  customerName?: string;
  orderNote?: string;
  packingCharge?: number;
  discountPct?: number;
  discountFlat?: number;
  createdAt: number;
  persisted?: boolean;
};

const DEFAULT_TAB_ID = "counter";
function makeDefaultTab(): Tab {
  return {
    id: DEFAULT_TAB_ID,
    name: "Counter",
    lines: [],
    orderType: "dine-in",
    customerName: "",
    orderNote: "",
    packingCharge: 0,
    discountPct: 0,
    discountFlat: 0,
    createdAt: 0,
    persisted: false,
  };
}

type Props = {
  outlet: Outlet;
  outlets: Outlet[];
  categories: Category[];
  products: Product[];
  paymentConfig: PublicPaymentConfig;
  restaurantSlug: string;
  restaurantName: string;
  staffEmail: string;
  staffRoleLabel: string;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => {
  open: () => void;
};

function loadRazorpaySdk(): Promise<RazorpayConstructor | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      resolve(
        (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay ?? null,
      );
    };
    script.onerror = () => resolve(null);
    document.body.appendChild(script);
  });
}

function buildConfigKey(productId: string, options: SelectedOption[]): string {
  if (options.length === 0) return `p${productId}`;
  const ids = options.map((o) => o.option_id).sort();
  return `p${productId}:${ids.join("-")}`;
}

const ORDER_TYPES: { value: OrderType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "dine-in", label: "Dine-in", icon: Utensils },
  { value: "takeaway", label: "Takeaway", icon: Package },
  { value: "delivery", label: "Delivery", icon: Bike },
];

export function PosBilling({
  outlet,
  outlets,
  categories,
  products,
  paymentConfig,
  restaurantSlug,
  restaurantName,
  staffEmail,
  staffRoleLabel,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTable = searchParams?.get("table") ?? null;
  const outletId = outlet.id;
  const [switchingOutlet, startOutletSwitch] = useTransition();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [vegFilter, setVegFilter] = useState<VegFilter>("all");
  const [tabs, setTabs] = useState<Tab[]>(() => [makeDefaultTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(DEFAULT_TAB_ID);
  const [creatingTab, setCreatingTab] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTableZone, setSelectedTableZone] = useState<string>("all");
  const [tableStatusFilter, setTableStatusFilter] = useState<
    "all" | "occupied" | "available"
  >("all");
  const [posting, setPosting] = useState<Tender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modProduct, setModProduct] = useState<Product | null>(null);
  const [editingLineNoteKey, setEditingLineNoteKey] = useState<string | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  // Online / Gateway QR Settlement dialog state
  const [onlinePayOpen, setOnlinePayOpen] = useState(false);
  const [onlinePayTab, setOnlinePayTab] = useState<"upi" | "razorpay" | "stripe">(
    paymentConfig.razorpayEnabled
      ? "razorpay"
      : paymentConfig.stripeEnabled
        ? "stripe"
        : "upi",
  );
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [adhocUpiVpa, setAdhocUpiVpa] = useState(paymentConfig.upiVpa ?? "");
  const [stripePosSession, setStripePosSession] = useState<{
    sessionId: string;
    url: string;
  } | null>(null);
  const [copiedStripeLink, setCopiedStripeLink] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const lines = activeTab?.lines ?? [];
  const orderType: OrderType = activeTab?.orderType ?? "dine-in";
  const customerName = activeTab?.customerName ?? "";
  const orderNote = activeTab?.orderNote ?? "";
  const packingCharge = Number(activeTab?.packingCharge ?? 0);
  const discountPct = Number(activeTab?.discountPct ?? 0);
  const discountFlat = Number(activeTab?.discountFlat ?? 0);
  const [kotSavedMsg, setKotSavedMsg] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          orderType: "dine-in",
          createdAt: t.createdAt,
          persisted: true,
        }));
        const all = [makeDefaultTab(), ...mapped];
        setTabs(all);
        if (requestedTable) {
          const reqNorm = requestedTable.split("·")[0].trim().toLowerCase();
          const match = mapped.find(
            (t) =>
              t.name.toLowerCase() === requestedTable.toLowerCase() ||
              t.name.split("·")[0].trim().toLowerCase() === reqNorm,
          );
          if (match) setActiveTabId(match.id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, outletId, requestedTable]);

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

  const updateActiveTab = useCallback(
    (updater: (prev: Tab) => Tab) => {
      setTabs((prev) => {
        const next = prev.map((t) => (t.id === activeTabId ? updater(t) : t));
        const active = next.find((t) => t.id === activeTabId);
        if (active) scheduleSave(active);
        return next;
      });
    },
    [activeTabId, restaurantSlug],
  );

  const updateActiveLines = useCallback(
    (updater: (prev: Line[]) => Line[]) => {
      updateActiveTab((t) => ({ ...t, lines: updater(t.lines) }));
    },
    [updateActiveTab],
  );

  const createTab = async () => {
    const name = newTabName.trim() || `Table ${tabs.length}`;
    setNewTabName("");
    setCreatingTab(false);
    const res = await createTabAction(restaurantSlug, outletId, name);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setTabs((prev) => [
      ...prev,
      {
        id: res.tab.id,
        name: res.tab.name,
        lines: [],
        orderType: "dine-in",
        createdAt: res.tab.createdAt,
        persisted: true,
      },
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
    const counts = new Map<string, number>();
    for (const p of products) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return categories
      .filter((c) => (counts.get(c.name) ?? 0) > 0)
      .map((c) => ({ ...c, count: counts.get(c.name) ?? 0 }));
  }, [categories, products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeCategory && p.category !== activeCategory) return false;
      const isVeg = (p.veg_status ?? "Veg").toLowerCase() === "veg";
      if (vegFilter === "veg" && !isVeg) return false;
      if (vegFilter === "non-veg" && isVeg) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, activeCategory, vegFilter, search]);

  // Count how many of each product ID are in the active bill for visual badge feedback
  const qtyByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) {
      map.set(l.product.id, (map.get(l.product.id) ?? 0) + l.qty);
    }
    return map;
  }, [lines]);

  const addLine = useCallback(
    (product: Product, selectedOptions: SelectedOption[] = []) => {
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
    },
    [updateActiveLines],
  );

  const handleProductClick = useCallback(
    (product: Product) => {
      if (product.has_addons) {
        setModProduct(product);
      } else {
        addLine(product);
      }
    },
    [addLine],
  );

  const setQty = (configKey: string, qty: number) => {
    updateActiveLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.configKey !== configKey)
        : prev.map((l) => (l.configKey === configKey ? { ...l, qty } : l)),
    );
  };

  const setLineNote = (configKey: string, note: string) => {
    updateActiveLines((prev) =>
      prev.map((l) =>
        l.configKey === configKey ? { ...l, instructions: note } : l,
      ),
    );
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    for (const { product, qty, unitPrice } of lines) {
      const line = unitPrice * qty;
      subtotal += line;
      const rate = Number(product.gst_rate ?? 5) / 100;
      gst += line - line / (1 + rate);
    }
    const packing = orderType === "dine-in" ? 0 : Math.max(0, packingCharge);
    const rawDiscount =
      discountPct > 0
        ? (subtotal * Math.min(100, discountPct)) / 100
        : Math.max(0, discountFlat);
    const discount = Math.min(subtotal, Number(rawDiscount.toFixed(2)));
    const netBeforeRound = Math.max(0, subtotal + packing - discount);
    const roundedTotal = Math.round(netBeforeRound);
    const rounding = Number((roundedTotal - netBeforeRound).toFixed(2));
    return {
      subtotal,
      taxable: subtotal - gst,
      cgst: gst / 2,
      sgst: gst / 2,
      gst,
      packing,
      discount,
      rounding,
      total: roundedTotal,
    };
  }, [lines, orderType, packingCharge, discountPct, discountFlat]);

  const transferCurrentBillTo = (targetTabId: string) => {
    if (!activeTab || activeTab.lines.length === 0 || targetTabId === activeTabId) return;
    const sourceLines = [...activeTab.lines];
    const sourceId = activeTab.id;
    const sourceName = activeTab.name;
    const sourcePersisted = activeTab.persisted;

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === sourceId) return { ...t, lines: [] };
        if (t.id === targetTabId) {
          const merged = [...t.lines, ...sourceLines];
          if (t.persisted) {
            saveTabAction(restaurantSlug, t.id, t.name, merged).catch(() => {});
          }
          return { ...t, lines: merged };
        }
        return t;
      }),
    );
    if (sourcePersisted) {
      saveTabAction(restaurantSlug, sourceId, sourceName, []).catch(() => {});
    }
    setActiveTabId(targetTabId);
    setTableModalOpen(false);
  };

  const holdAndSendKot = useCallback(async () => {
    if (!activeTab || activeTab.lines.length === 0) return;
    if (activeTab.persisted) {
      await saveTabAction(restaurantSlug, activeTab.id, activeTab.name, activeTab.lines).catch(
        () => {},
      );
    } else {
      const res = await createTabAction(
        restaurantSlug,
        outletId,
        customerName.trim() || `Table Hold ${tabs.length}`,
      );
      if (res.ok) {
        await saveTabAction(restaurantSlug, res.tab.id, res.tab.name, activeTab.lines).catch(
          () => {},
        );
      }
    }
    const count = activeTab.lines.reduce((s, l) => s + l.qty, 0);
    const short = activeTab.name.split("·")[0].trim();
    setKotSavedMsg(`KOT synced for ${short} (${count} items)`);
    setTimeout(() => setKotSavedMsg(null), 2600);
  }, [activeTab, restaurantSlug, outletId, customerName, tabs.length]);

  const tender = useCallback(
    async (mode: Tender) => {
      if (lines.length === 0 || posting) return;
      setPosting(mode);
      setError(null);

      const resolvedCustomer =
        customerName.trim() ||
        (activeTab && activeTab.id !== DEFAULT_TAB_ID
          ? activeTab.name.split("·")[0].trim()
          : "Walk-in");

      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outlet_id: outletId,
            source: "pos",
            customer_name: resolvedCustomer,
            customer_email: `pos+${mode}@billjot.local`,
            order_type: orderType,
            subtotal: Number(totals.taxable.toFixed(2)),
            takeaway_charges: Number(totals.packing.toFixed(2)),
            discount_amount: Number(totals.discount.toFixed(2)),
            rounding_amount: Number(totals.rounding.toFixed(2)),
            total_amount: Number(totals.total.toFixed(2)),
            instructions: orderNote.trim() || undefined,
            items: lines.map((l) => ({
              quantity: l.qty,
              unit_price: l.unitPrice,
              total_price: Number((l.unitPrice * l.qty).toFixed(2)),
              instructions: l.instructions?.trim() || undefined,
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

        clearSettledActiveTab();
        router.push(`/r/${restaurantSlug}/pos/receipt/${json.order.id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Order failed");
        setPosting(null);
      }
    },
    [
      lines,
      posting,
      customerName,
      activeTab,
      outletId,
      orderType,
      totals,
      orderNote,
      restaurantSlug,
      router,
    ],
  );

  function clearSettledActiveTab() {
    const settledId = activeTabId;
    const wasPersisted = activeTab?.persisted;
    const isFloorTable = Boolean(activeTab?.name.includes("·"));
    if (isFloorTable && activeTab) {
      setTabs((prev) =>
        prev.map((t) => (t.id === settledId ? { ...t, lines: [] } : t)),
      );
      if (wasPersisted) {
        saveTabAction(restaurantSlug, settledId, activeTab.name, []).catch(
          () => {},
        );
      }
    } else {
      const remaining = tabs.filter((t) => t.id !== settledId);
      const next = remaining.length > 0 ? remaining : [makeDefaultTab()];
      setTabs(next);
      setActiveTabId(next[0].id);
      if (wasPersisted) {
        deleteTabAction(restaurantSlug, settledId).catch(() => {});
      }
    }
  }

  function buildGatewayItemsPayload() {
    return lines.map((l) => ({
      quantity: l.qty,
      instructions: l.instructions?.trim() || undefined,
      product_config: {
        product_id: l.product.id,
        name: l.product.name,
        base_price: Number(l.product.price),
        selected_options: l.selectedOptions,
        gst_rate: Number(l.product.gst_rate ?? 5),
        hsn_code: l.product.hsn_code,
      },
    }));
  }

  async function handleRazorpayPosCheckout() {
    if (lines.length === 0 || onlineBusy) return;
    setOnlineBusy(true);
    setOnlineError(null);

    const resolvedCustomer =
      customerName.trim() ||
      (activeTab && activeTab.id !== DEFAULT_TAB_ID
        ? activeTab.name.split("·")[0].trim()
        : "Walk-in");

    try {
      const Razorpay = await loadRazorpaySdk();
      if (!Razorpay) {
        throw new Error(
          "Could not load Razorpay Checkout SDK. Check network connection.",
        );
      }

      const createRes = await fetch("/api/payments/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          restaurant_slug: restaurantSlug,
          source: "pos",
          customer_name: resolvedCustomer,
          customer_email: "pos+razorpay@billjot.local",
          order_type: orderType,
          instructions: orderNote.trim() || undefined,
          discount_amount: Number(totals.discount.toFixed(2)),
          rounding_amount: Number(totals.rounding.toFixed(2)),
          takeaway_charges: Number(totals.packing.toFixed(2)),
          items: buildGatewayItemsPayload(),
        }),
      });

      const createJson = (await createRes.json().catch(() => ({}))) as {
        razorpayOrderId?: string;
        amountPaise?: number;
        currency?: string;
        keyId?: string;
        error?: string;
      };

      if (!createRes.ok || !createJson.razorpayOrderId || !createJson.keyId) {
        throw new Error(createJson.error ?? "Failed to create Razorpay order");
      }

      const rzp = new Razorpay({
        key: createJson.keyId,
        amount: createJson.amountPaise,
        currency: createJson.currency ?? "INR",
        name: restaurantName,
        description: `POS Bill (${resolvedCustomer})`,
        order_id: createJson.razorpayOrderId,
        prefill: {
          name: resolvedCustomer,
        },
        theme: { color: "#18181b" },
        modal: {
          ondismiss: () => {
            setOnlineBusy(false);
          },
        },
        handler: async (resp: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await fetch("/api/payments/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(resp),
            });
            const verifyJson = (await verifyRes.json().catch(() => ({}))) as {
              order?: { id: string };
              error?: string;
            };
            if (!verifyRes.ok || !verifyJson.order?.id) {
              throw new Error(
                verifyJson.error ?? "Razorpay signature verification failed",
              );
            }
            setOnlinePayOpen(false);
            clearSettledActiveTab();
            router.push(`/r/${restaurantSlug}/pos/receipt/${verifyJson.order.id}`);
          } catch (verifyErr) {
            setOnlineError(
              verifyErr instanceof Error
                ? verifyErr.message
                : "Payment verification failed",
            );
            setOnlineBusy(false);
          }
        },
      });

      rzp.open();
    } catch (e) {
      setOnlineError(e instanceof Error ? e.message : "Razorpay checkout failed");
      setOnlineBusy(false);
    }
  }

  async function handleGenerateStripePosSession() {
    if (lines.length === 0 || onlineBusy) return;
    setOnlineBusy(true);
    setOnlineError(null);

    const resolvedCustomer =
      customerName.trim() ||
      (activeTab && activeTab.id !== DEFAULT_TAB_ID
        ? activeTab.name.split("·")[0].trim()
        : "Walk-in");

    try {
      const res = await fetch("/api/payments/stripe/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          restaurant_slug: restaurantSlug,
          return_context: "pos",
          source: "pos",
          customer_name: resolvedCustomer,
          customer_email: "pos+stripe@billjot.local",
          order_type: orderType,
          instructions: orderNote.trim() || undefined,
          discount_amount: Number(totals.discount.toFixed(2)),
          rounding_amount: Number(totals.rounding.toFixed(2)),
          takeaway_charges: Number(totals.packing.toFixed(2)),
          items: buildGatewayItemsPayload(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        sessionId?: string;
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.sessionId || !json.url) {
        throw new Error(json.error ?? "Failed to create Stripe Checkout session");
      }
      setStripePosSession({ sessionId: json.sessionId, url: json.url });
    } catch (e) {
      setOnlineError(
        e instanceof Error ? e.message : "Stripe session creation failed",
      );
    } finally {
      setOnlineBusy(false);
    }
  }

  async function handleVerifyStripePosSession() {
    if (!stripePosSession?.sessionId || onlineBusy) return;
    setOnlineBusy(true);
    setOnlineError(null);
    try {
      const res = await fetch("/api/payments/stripe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: stripePosSession.sessionId }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        order?: { id: string };
        error?: string;
      };
      if (!res.ok || !json.order?.id) {
        throw new Error(
          json.error ??
            "Payment not completed yet. Ask the customer to complete Stripe Checkout and click Verify again.",
        );
      }
      setOnlinePayOpen(false);
      setStripePosSession(null);
      clearSettledActiveTab();
      router.push(`/r/${restaurantSlug}/pos/receipt/${json.order.id}`);
    } catch (e) {
      setOnlineError(
        e instanceof Error ? e.message : "Could not verify Stripe payment",
      );
    } finally {
      setOnlineBusy(false);
    }
  }

  // Global keyboard shortcuts for fast cashier operation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        tender("cash");
      } else if (e.key === "F9") {
        e.preventDefault();
        tender("upi");
      } else if (e.key === "F10") {
        e.preventDefault();
        tender("card");
      } else if (e.key === "F11" && lines.length > 0) {
        e.preventDefault();
        setOnlineError(null);
        setStripePosSession(null);
        setOnlinePayOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tender, lines.length]);

  const totalItems = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground select-none">
      {/* Top operational bar */}
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-border bg-card px-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-primary text-[11px] font-semibold text-primary-foreground">
            POS
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold leading-none">
                {restaurantName}
              </span>
              {outlet.gstin && (
                <span className="hidden rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground lg:inline-block">
                  GST {outlet.gstin}
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {staffRoleLabel} · {staffEmail}
            </div>
          </div>
        </div>

        {outlets.length > 1 ? (
          <Select
            value={String(outletId)}
            disabled={switchingOutlet}
            onValueChange={(v) => {
              if (!v) return;
              startOutletSwitch(async () => {
                await setSelectedOutletAction(restaurantSlug, v);
                router.refresh();
              });
            }}
          >
            <SelectTrigger size="sm" className="w-40">
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
          <Badge variant="outline" className="hidden font-normal sm:inline-flex">
            {outlet.name}
          </Badge>
        )}

        {/* Search input with Enter-to-add */}
        <div className="relative ml-auto w-56 sm:w-72 lg:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filteredProducts.length > 0) {
                e.preventDefault();
                handleProductClick(filteredProducts[0]);
                if (filteredProducts.length === 1) setSearch("");
              } else if (e.key === "Escape") {
                setSearch("");
                searchInputRef.current?.blur();
              }
            }}
            placeholder="Search item, code… (Press /)"
            className="h-8 pl-8 pr-14 text-xs"
            autoFocus
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">
            ↵ Add
          </kbd>
        </div>

        {/* Dietary filter */}
        <div className="hidden items-center rounded-[10px] bg-muted p-0.5 md:flex">
          {(
            [
              { key: "all", label: "All" },
              { key: "veg", label: "Veg", dot: "bg-emerald-500" },
              { key: "non-veg", label: "Non-Veg", dot: "bg-rose-500" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setVegFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                vegFilter === f.key
                  ? "bg-card text-foreground shadow-control"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {"dot" in f && <span className={cn("h-1.5 w-1.5 rounded-full", f.dot)} />}
              {f.label}
            </button>
          ))}
        </div>

        {/* Quick links to Tables, Kitchen & Admin */}
        <div className="hidden items-center gap-1.5 sm:flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTableModalOpen(true)}
            className="h-8 text-xs"
            title="Select Floor Table"
          >
            <LayoutGrid className="mr-1 h-3.5 w-3.5" />
            Tables ({tabs.filter((t) => t.id !== DEFAULT_TAB_ID && t.lines.length > 0).length}/
            {Math.max(0, tabs.length - 1)})
          </Button>
          <Link
            href={`/r/${restaurantSlug}/admin/kitchen`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs")}
            title="Open Kitchen Display"
          >
            <ChefHat className="mr-1 h-3.5 w-3.5" />
            KDS
          </Link>
          <Link
            href={`/r/${restaurantSlug}/admin`}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 text-xs")}
            title="Open Admin Portal"
          >
            <LayoutDashboard className="mr-1 h-3.5 w-3.5" />
            Admin
          </Link>
        </div>

        <FullscreenToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: Menu Catalog */}
        <section className="flex min-w-0 flex-1 flex-col bg-background">
          {/* Category strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border bg-card px-3 py-2 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                activeCategory === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-transparent bg-muted text-foreground/80 hover:bg-foreground/10 hover:text-foreground",
              )}
            >
              All items
              <span
                className={cn(
                  "rounded-full px-1 text-[11px] tabular-nums",
                  activeCategory === null
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {products.length}
              </span>
            </button>
            {visibleCategories.map((c) => {
              const active = activeCategory === c.name;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCategory(c.name)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-transparent bg-muted text-foreground/80 hover:bg-foreground/10 hover:text-foreground",
                  )}
                >
                  <span>{c.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-1 text-[11px] tabular-nums",
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Product Grid */}
          <div className="grid flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredProducts.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center gap-2 py-20 text-center text-sm text-muted-foreground">
                <ShoppingBag className="h-7 w-7 opacity-40" />
                <p className="font-medium text-foreground">
                  {search || vegFilter !== "all"
                    ? "No matching items"
                    : "No products in this outlet"}
                </p>
                {search || vegFilter !== "all" ? (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setSearch("");
                      setVegFilter("all");
                      setActiveCategory(null);
                    }}
                  >
                    Reset filters
                  </Button>
                ) : (
                  <p className="text-xs">
                    Add products in the Admin Menu section to start billing.
                  </p>
                )}
              </div>
            )}

            {filteredProducts.map((p) => {
              const isVeg = (p.veg_status ?? "Veg").toLowerCase() === "veg";
              const inBillQty = qtyByProductId.get(p.id) ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleProductClick(p)}
                  className={cn(
                    "group relative flex min-h-[100px] flex-col justify-between rounded-2xl border bg-card p-3 text-left shadow-card transition-all duration-200 hover:shadow-float active:scale-[0.97]",
                    inBillQty > 0
                      ? "border-primary ring-2 ring-primary/15"
                      : "border-transparent",
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        aria-label={isVeg ? "Veg" : "Non-veg"}
                        className={cn(
                          "flex h-3 w-3 items-center justify-center rounded-[2px] border",
                          isVeg ? "border-emerald-600" : "border-rose-600",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            isVeg ? "bg-emerald-600" : "bg-rose-600",
                          )}
                        />
                      </span>
                      {p.code && (
                        <span className="tabular-nums text-[11px] font-medium text-muted-foreground">
                          {p.code}
                        </span>
                      )}
                    </div>

                    {inBillQty > 0 ? (
                      <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 tabular-nums text-[11px] font-semibold text-primary-foreground">
                        {inBillQty}×
                      </span>
                    ) : p.has_addons ? (
                      <Settings2 className="h-3 w-3 text-muted-foreground" />
                    ) : null}
                  </div>

                  <div className="my-2 flex items-center gap-2.5">
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        className="h-10 w-10 shrink-0 rounded-lg border border-border/60 object-cover bg-muted"
                      />
                    )}
                    <div className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                      {p.name}
                    </div>
                  </div>

                  <div className="flex w-full items-baseline justify-between">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      ₹{Number(p.price).toFixed(0)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {Number(p.gst_rate ?? 5)}% GST
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right: Active Bill & Settlement */}
        <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-card">
          {/* Open Tabs / Tables strip */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/40 px-2.5 py-1.5 [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => setTableModalOpen(true)}
              className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-xs font-medium text-foreground transition hover:border-foreground/40"
              title="Open Floor Map"
            >
              <LayoutGrid className="h-3 w-3" />
              Floor
            </button>
            {tabs
              .filter(
                (t) =>
                  t.id === DEFAULT_TAB_ID ||
                  t.id === activeTabId ||
                  t.lines.length > 0,
              )
              .map((t) => {
                const count = t.lines.reduce((s, l) => s + l.qty, 0);
                const isActive = t.id === activeTabId;
                const shortName = t.name.split("·")[0].trim();
                const isFloorTable = t.name.includes("·");
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveTabId(t.id)}
                      className="flex items-center gap-1.5 font-medium"
                    >
                      <span>{shortName}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-1 text-[11px] tabular-nums",
                            isActive ? "bg-primary-foreground/20" : "bg-muted",
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                    {t.id !== DEFAULT_TAB_ID && !isFloorTable && (
                      <button
                        type="button"
                        onClick={() => closeTab(t.id)}
                        className="ml-0.5 opacity-60 transition hover:opacity-100"
                        aria-label={`Close ${shortName}`}
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
                placeholder="Table 4 / Hold…"
                className="h-6 w-28 shrink-0 rounded-md border border-primary bg-card px-2 text-xs outline-none placeholder:text-muted-foreground"
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreatingTab(true)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-dashed border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition hover:border-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Hold
              </button>
            )}
          </div>

          {/* Order Type selector + Customer/Notes toggle */}
          <div className="space-y-2 border-b border-border p-2.5">
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-0.5">
              {ORDER_TYPES.map((t) => {
                const Icon = t.icon;
                const active = orderType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() =>
                      updateActiveTab((prev) => ({ ...prev, orderType: t.value }))
                    }
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md py-1 text-xs font-medium transition-all",
                      active
                        ? "bg-card text-foreground shadow-control"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between px-0.5 text-xs">
              <button
                type="button"
                onClick={() => setShowOrderDetails((v) => !v)}
                className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                {customerName || orderNote || packingCharge > 0
                  ? `${customerName || activeTab?.name || "Walk-in"}${orderNote ? " · Note added" : ""}`
                  : "Add customer name or kitchen note"}
              </button>
              {totalItems > 0 && (
                <span className="tabular-nums text-[11px] text-muted-foreground">
                  {totalItems} {totalItems === 1 ? "item" : "items"}
                </span>
              )}
            </div>

            {showOrderDetails && (
              <div className="grid gap-2 rounded-xl bg-muted/60 p-2">
                <Input
                  value={customerName}
                  onChange={(e) =>
                    updateActiveTab((t) => ({ ...t, customerName: e.target.value }))
                  }
                  placeholder="Customer name / Table / Phone"
                  className="h-7 bg-card text-xs"
                />
                <Input
                  value={orderNote}
                  onChange={(e) =>
                    updateActiveTab((t) => ({ ...t, orderNote: e.target.value }))
                  }
                  placeholder="Kitchen note (e.g. less spicy, extra cutlery)…"
                  className="h-7 bg-card text-xs"
                />
                {orderType !== "dine-in" && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      Packing charge (₹)
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      value={packingCharge || ""}
                      onChange={(e) =>
                        updateActiveTab((t) => ({
                          ...t,
                          packingCharge: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      placeholder="0"
                      className="h-7 w-24 bg-card text-right text-xs tabular-nums"
                    />
                  </div>
                )}
                <div className="space-y-1.5 border-t border-border pt-1.5">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Discount</span>
                    <div className="flex items-center gap-1">
                      {[0, 5, 10, 15, 20].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() =>
                            updateActiveTab((t) => ({
                              ...t,
                              discountPct: pct,
                              discountFlat: 0,
                            }))
                          }
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-[11px] font-medium",
                            discountPct === pct && discountFlat === 0
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {pct === 0 ? "None" : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      Or flat discount (₹)
                    </span>
                    <Input
                      type="number"
                      min={0}
                      step="1"
                      value={discountFlat || ""}
                      onChange={(e) =>
                        updateActiveTab((t) => ({
                          ...t,
                          discountPct: 0,
                          discountFlat: Math.max(0, Number(e.target.value) || 0),
                        }))
                      }
                      placeholder="0"
                      className="h-7 w-24 bg-card text-right text-xs tabular-nums"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Line items */}
          <div className="flex-1 divide-y divide-border overflow-y-auto">
            {lines.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-xs text-muted-foreground">
                <Receipt className="h-7 w-7 opacity-30" />
                <p>Tap any item or press / to search</p>
              </div>
            )}
            {lines.map(
              ({
                configKey,
                product,
                qty,
                selectedOptions,
                unitPrice,
                instructions,
              }) => {
                const isEditingNote = editingLineNoteKey === configKey;
                return (
                  <div key={configKey} className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium text-foreground">
                            {product.name}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingLineNoteKey(
                                isEditingNote ? null : configKey,
                              )
                            }
                            title="Item cooking note"
                            className={cn(
                              "rounded-full px-1 py-0.5 text-[11px] transition-colors",
                              instructions
                                ? "bg-amber-500/10 font-medium text-amber-700"
                                : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
                            )}
                          >
                            {instructions ? "Note" : "+note"}
                          </button>
                        </div>
                        {selectedOptions.length > 0 && (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {selectedOptions.map((o) => o.option_name).join(" · ")}
                          </div>
                        )}
                        {instructions && !isEditingNote && (
                          <div className="truncate text-[11px] text-amber-700">
                            “{instructions}”
                          </div>
                        )}
                        <div className="text-[11px] tabular-nums text-muted-foreground">
                          ₹{unitPrice.toFixed(0)} × {qty}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon-xs"
                          onClick={() => setQty(configKey, qty - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-xs font-medium tabular-nums">
                          {qty}
                        </span>
                        <Button
                          variant="outline"
                          size="icon-xs"
                          onClick={() => setQty(configKey, qty + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="w-14 text-right text-xs font-semibold tabular-nums">
                        ₹{(unitPrice * qty).toFixed(0)}
                      </div>
                    </div>

                    {isEditingNote && (
                      <div className="mt-1.5">
                        <Input
                          autoFocus
                          value={instructions ?? ""}
                          onChange={(e) => setLineNote(configKey, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                              setEditingLineNoteKey(null);
                            }
                          }}
                          placeholder="Item note (e.g. no onion, extra roast)…"
                          className="h-7 text-xs"
                        />
                      </div>
                    )}
                  </div>
                );
              },
            )}
          </div>

          {/* Totals + Tender Pad */}
          <div className="border-t border-border bg-muted/20 p-3">
            <div className="space-y-1 text-xs">
              <Row label="Taxable value" value={totals.taxable} />
              <Row label="CGST" value={totals.cgst} />
              <Row label="SGST" value={totals.sgst} />
              {totals.packing > 0 && (
                <Row label="Packing charge" value={totals.packing} />
              )}
              {totals.discount > 0 && (
                <Row label="Discount" value={-totals.discount} />
              )}
              {totals.rounding !== 0 && (
                <Row label="Round-off" value={totals.rounding} />
              )}
            </div>
            <Separator className="my-2" />
            <Row label="Grand Total" value={totals.total} bold large />

            {kotSavedMsg && (
              <p className="mt-2 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-center text-xs font-medium text-emerald-700">
                {kotSavedMsg}
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="mt-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
              >
                {error}
              </p>
            )}

            <div className="mt-2.5 flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={holdAndSendKot}
                disabled={lines.length === 0 || posting !== null}
                className="flex-1 text-xs font-medium"
              >
                <ChefHat className="mr-1.5 h-3.5 w-3.5" />
                Save KOT / Hold Table
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTableModalOpen(true)}
                className="text-xs font-medium"
                title="Switch or Transfer Table"
              >
                <LayoutGrid className="mr-1 h-3.5 w-3.5" />
                Tables
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <TenderButton
                label="Cash"
                shortcut="F8"
                icon={Banknote}
                onClick={() => tender("cash")}
                disabled={lines.length === 0 || posting !== null}
                loading={posting === "cash"}
              />
              <TenderButton
                label="UPI"
                shortcut="F9"
                icon={Smartphone}
                onClick={() => tender("upi")}
                disabled={lines.length === 0 || posting !== null}
                loading={posting === "upi"}
              />
              <TenderButton
                label="Card"
                shortcut="F10"
                icon={CreditCard}
                onClick={() => tender("card")}
                disabled={lines.length === 0 || posting !== null}
                loading={posting === "card"}
              />
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={lines.length === 0 || posting !== null}
              onClick={() => {
                setOnlineError(null);
                setStripePosSession(null);
                setOnlinePayOpen(true);
              }}
              className="mt-2 w-full justify-between border border-border bg-card text-xs font-semibold hover:bg-muted"
            >
              <span
                className="inline-flex min-w-0 items-center gap-1.5"
                title="Razorpay, Stripe or UPI dynamic QR"
              >
                <QrCode className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Online payment or QR</span>
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                F11
              </span>
            </Button>

            <Button
              variant="ghost"
              size="xs"
              onClick={() => updateActiveLines(() => [])}
              disabled={lines.length === 0 || posting !== null}
              className="mt-1.5 w-full text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Clear current bill
            </Button>
          </div>
        </aside>
      </div>

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

      {/* Online Payment Gateway & Dynamic UPI QR Dialog */}
      <Dialog open={onlinePayOpen} onOpenChange={setOnlinePayOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>Collect Online / Dynamic QR</span>
              <Badge variant="secondary" className="tabular-nums text-xs">
                ₹{totals.total.toFixed(2)}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Collect verified payment via Razorpay, Stripe Checkout QR, or Dynamic Bharat/UPI QR for{" "}
              <span className="font-medium text-foreground">
                {activeTab?.name.split("·")[0].trim() || "Counter"}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          {/* Gateway selector tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/50 p-1 text-xs">
            {(
              [
                { id: "upi", label: "Dynamic UPI QR" },
                { id: "razorpay", label: "Razorpay" },
                { id: "stripe", label: "Stripe Card / QR" },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setOnlinePayTab(g.id);
                  setOnlineError(null);
                }}
                className={cn(
                  "rounded-md py-1.5 font-medium transition-colors",
                  onlinePayTab === g.id
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>

          {onlineError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {onlineError}
            </div>
          )}

          {onlinePayTab === "upi" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={adhocUpiVpa}
                  onChange={(e) => setAdhocUpiVpa(e.target.value)}
                  placeholder="Merchant UPI ID (e.g. restaurant@okicici)"
                  className="h-8 text-xs font-mono"
                />
                {!paymentConfig.upiVpa && (
                  <Link
                    href={`/r/${restaurantSlug}/admin/settings`}
                    className="shrink-0 text-[11px] text-muted-foreground underline hover:text-foreground"
                  >
                    Save default
                  </Link>
                )}
              </div>

              {adhocUpiVpa.trim().includes("@") ? (
                <div className="flex flex-col items-center rounded-xl border border-border bg-muted/20 p-4 text-center">
                  <div className="rounded-lg border border-border bg-white p-2.5 shadow-2xs">
                    <QrCodeSvg
                      value={`upi://pay?pa=${encodeURIComponent(adhocUpiVpa.trim())}&pn=${encodeURIComponent(restaurantName)}&am=${totals.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(activeTab?.name.split("·")[0].trim() || "POS Bill")}`}
                      size={176}
                    />
                  </div>
                  <div className="mt-2.5 text-sm font-semibold tabular-nums">
                    Scan to pay ₹{totals.total.toFixed(2)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Works with GPay, PhonePe, Paytm, BHIM &amp; CRED UPI ({adhocUpiVpa.trim()})
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  Enter your restaurant UPI VPA above (or configure it permanently in{" "}
                  <Link
                    href={`/r/${restaurantSlug}/admin/settings`}
                    className="font-medium text-foreground underline"
                  >
                    Admin Settings
                  </Link>
                  ) to generate an amount-locked Dynamic UPI QR code.
                </div>
              )}

              <Button
                type="button"
                className="w-full"
                disabled={posting !== null}
                onClick={() => {
                  setOnlinePayOpen(false);
                  tender("upi");
                }}
              >
                <Check className="mr-1.5 h-4 w-4" />
                Confirm UPI Received &amp; Print Receipt
              </Button>
            </div>
          )}

          {onlinePayTab === "razorpay" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    Razorpay Checkout (UPI · Cards · Netbanking)
                  </span>
                  <Badge
                    variant={paymentConfig.razorpayEnabled ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {paymentConfig.razorpayEnabled ? "Active" : "Keys Not Set"}
                  </Badge>
                </div>
                <p className="mt-1.5 text-muted-foreground">
                  Opens Razorpay Checkout directly on this terminal with UPI QR, UPI Collect, Domestic Cards, and Wallets. Order &amp; KOT are confirmed automatically once signature is verified.
                </p>
                {!paymentConfig.razorpayEnabled && (
                  <p className="mt-2 text-[11px] text-amber-700">
                    Configure Razorpay Key ID &amp; Secret in{" "}
                    <Link
                      href={`/r/${restaurantSlug}/admin/settings`}
                      className="font-semibold underline"
                    >
                      Outlet Settings
                    </Link>{" "}
                    to enable live collection.
                  </p>
                )}
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={!paymentConfig.razorpayEnabled || onlineBusy}
                onClick={handleRazorpayPosCheckout}
              >
                {onlineBusy ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Opening Razorpay...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-1.5 h-4 w-4" />
                    Collect ₹{totals.total.toFixed(2)} via Razorpay
                  </>
                )}
              </Button>
            </div>
          )}

          {onlinePayTab === "stripe" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    Stripe Checkout (Cards · Apple Pay · Google Pay)
                  </span>
                  <Badge
                    variant={paymentConfig.stripeEnabled ? "default" : "outline"}
                    className="text-[10px]"
                  >
                    {paymentConfig.stripeEnabled ? "Active" : "Keys Not Set"}
                  </Badge>
                </div>
                <p className="mt-1.5 text-muted-foreground">
                  Generates a hosted Stripe Checkout QR &amp; link so guests can scan with their phone and pay via Apple Pay, Google Pay, or International Cards.
                </p>
                {!paymentConfig.stripeEnabled && (
                  <p className="mt-2 text-[11px] text-amber-700">
                    Configure Stripe Secret Key in{" "}
                    <Link
                      href={`/r/${restaurantSlug}/admin/settings`}
                      className="font-semibold underline"
                    >
                      Outlet Settings
                    </Link>{" "}
                    to enable Stripe Checkout.
                  </p>
                )}
              </div>

              {stripePosSession ? (
                <div className="space-y-3">
                  <div className="flex flex-col items-center rounded-xl border border-border bg-muted/20 p-3.5 text-center">
                    <div className="rounded-lg border border-border bg-white p-2 shadow-2xs">
                      <QrCodeSvg value={stripePosSession.url} size={168} />
                    </div>
                    <div className="mt-2 text-xs font-medium">
                      Customer scans QR to pay ₹{totals.total.toFixed(2)} on Stripe
                    </div>
                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          if (typeof navigator !== "undefined" && navigator.clipboard) {
                            navigator.clipboard.writeText(stripePosSession.url);
                            setCopiedStripeLink(true);
                            setTimeout(() => setCopiedStripeLink(false), 1800);
                          }
                        }}
                      >
                        {copiedStripeLink ? (
                          <>
                            <Check className="mr-1 h-3 w-3" />
                            Copied Link
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1 h-3 w-3" />
                            Copy Link
                          </>
                        )}
                      </Button>
                      <a
                        href={stripePosSession.url}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({ variant: "outline", size: "xs" })}
                      >
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Open Checkout Tab
                      </a>
                    </div>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    disabled={onlineBusy}
                    onClick={handleVerifyStripePosSession}
                  >
                    {onlineBusy ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        Verifying with Stripe...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-1.5 h-4 w-4" />
                        Verify Stripe Payment &amp; Print Receipt
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  disabled={!paymentConfig.stripeEnabled || onlineBusy}
                  onClick={handleGenerateStripePosSession}
                >
                  {onlineBusy ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Creating Stripe Session...
                    </>
                  ) : (
                    <>
                      <QrCode className="mr-1.5 h-4 w-4" />
                      Generate Stripe QR &amp; Payment Link (₹{totals.total.toFixed(2)})
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={tableModalOpen} onOpenChange={setTableModalOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-2">
                <span>Floor Tables & Running Tabs</span>
                <Badge variant="secondary" className="text-[11px]">
                  {tabs.length - 1} Tables ·{" "}
                  {tabs.reduce((sum, t) => {
                    const m = t.name.match(/(\d+)\s*p/i);
                    return sum + (m ? Number(m[1]) : 0);
                  }, 0)}{" "}
                  Seats
                </Badge>
              </div>
              <Link
                href={`/r/${restaurantSlug}/admin/tables`}
                className="text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
              >
                Manage Floor Plan & Capacity →
              </Link>
            </DialogTitle>
            <DialogDescription>
              Search by table code (e.g. T-14, AC-05) or filter by hall/zone. Press Enter to jump directly to the first matching table.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            const parsedModalTabs = tabs.map((t) => {
              const parts = t.name.split("·").map((s) => s.trim());
              const code = parts[0] || t.name;
              const zone =
                parts[1] ||
                (t.id === DEFAULT_TAB_ID ? "Walk-in Counter" : "Floor");
              const seats = parts[2] || "";
              const qty = t.lines.reduce((s, l) => s + l.qty, 0);
              const val = t.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
              return { tab: t, code, zone, seats, qty, val };
            });

            const modalZones = Array.from(
              new Set(parsedModalTabs.map((x) => x.zone)),
            );
            const occupiedCount = parsedModalTabs.filter((x) => x.qty > 0).length;
            const freeCount = parsedModalTabs.length - occupiedCount;
            const q = tableSearch.trim().toLowerCase();

            const filteredModalTabs = parsedModalTabs.filter((x) => {
              if (
                selectedTableZone !== "all" &&
                x.zone !== selectedTableZone
              ) {
                return false;
              }
              if (tableStatusFilter === "occupied" && x.qty === 0) return false;
              if (tableStatusFilter === "available" && x.qty > 0) return false;
              if (!q) return true;
              return (
                x.code.toLowerCase().includes(q) ||
                x.zone.toLowerCase().includes(q)
              );
            });

            return (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && filteredModalTabs.length > 0) {
                          setActiveTabId(filteredModalTabs[0].tab.id);
                          setTableModalOpen(false);
                        }
                      }}
                      placeholder="Jump to table (e.g. T-12, AC-04, VIP-01)..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5 text-xs">
                    {(
                      [
                        { id: "all", label: `All (${parsedModalTabs.length})` },
                        { id: "occupied", label: `Occupied (${occupiedCount})` },
                        { id: "available", label: `Free (${freeCount})` },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTableStatusFilter(f.id)}
                        className={cn(
                          "rounded px-2 py-1 font-medium transition-colors",
                          tableStatusFilter === f.id
                            ? "bg-card text-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Zone filter pills */}
                <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTableZone("all")}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                      selectedTableZone === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All Zones ({parsedModalTabs.length})
                  </button>
                  {modalZones.map((z) => {
                    const cnt = parsedModalTabs.filter((x) => x.zone === z).length;
                    return (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setSelectedTableZone(z)}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                          selectedTableZone === z
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {z} ({cnt})
                      </button>
                    );
                  })}
                </div>

                {/* High-density grid */}
                <div className="grid max-h-[54vh] grid-cols-2 gap-2 overflow-y-auto py-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {filteredModalTabs.slice(0, 150).map(({ tab: t, code, zone, seats, qty, val }) => {
                    const isSelected = t.id === activeTabId;

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setActiveTabId(t.id);
                          setTableModalOpen(false);
                        }}
                        className={cn(
                          "flex flex-col justify-between rounded-lg border p-2.5 text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : qty > 0
                              ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500"
                              : "border-border bg-card hover:border-foreground/30",
                        )}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-xs font-semibold">
                              {code}
                            </span>
                            {seats && (
                              <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                {seats}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {zone}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-1.5 text-[11px]">
                          {qty > 0 ? (
                            <>
                              <span className="font-medium text-amber-700">
                                {qty} {qty === 1 ? "item" : "items"}
                              </span>
                              <span className="font-semibold tabular-nums">
                                ₹{val.toFixed(0)}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] text-emerald-700">
                              ● Free
                            </span>
                          )}
                        </div>
                        {!isSelected && lines.length > 0 && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              transferCurrentBillTo(t.id);
                            }}
                            className="mt-1.5 rounded border border-dashed border-border bg-muted/50 py-0.5 text-center text-[10px] font-medium text-muted-foreground hover:border-primary hover:text-foreground"
                          >
                            {qty > 0 ? "Merge here" : "Transfer here"}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {filteredModalTabs.length > 150 && (
                  <p className="text-center text-[11px] text-muted-foreground">
                    Showing first 150 of {filteredModalTabs.length} matching tables. Use the search box or hall tabs above to narrow results.
                  </p>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
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
      className={cn(
        "flex items-center justify-between",
        large ? "text-base" : "text-xs text-muted-foreground",
        bold && "font-semibold text-foreground",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">₹{value.toFixed(2)}</span>
    </div>
  );
}

function TenderButton({
  label,
  shortcut,
  icon: Icon,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className="relative flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-semibold"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Icon className="h-4 w-4" />
          <div className="flex items-center gap-1">
            <span>{label}</span>
            <span className="rounded-md bg-primary-foreground/20 px-1 tabular-nums text-[11px] font-normal">
              {shortcut}
            </span>
          </div>
        </>
      )}
    </Button>
  );
}
