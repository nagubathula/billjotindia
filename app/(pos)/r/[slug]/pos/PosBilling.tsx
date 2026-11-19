"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Tag,
  Trash2,
  Users,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { ModifierDialog } from "@/components/ModifierDialog";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import type { SelectedOption } from "@/components/CartProvider";
import {
  evaluateCouponDiscount,
  formatCouponOfferLabel,
} from "@/lib/coupons";
import type { PublicPaymentConfig } from "@/lib/payments";
import type {
  Category,
  Coupon,
  CustomerTab,
  OrderType,
  Outlet,
  Product,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { setSelectedOutletAction } from "./actions";
import {
  listTabsAction,
  createTabAction,
  saveTabAction,
  deleteTabAction,
  moveTabAction,
  sendKotAction,
  settleTabAction,
  voidSentItemAction,
  chargePosToCustomerTabAction,
} from "./tab-actions";

const VOID_REASONS = [
  { code: "customer_changed_mind", label: "Customer changed mind" },
  { code: "wrong_item_punched", label: "Wrong item punched" },
  { code: "out_of_stock", label: "Item out of stock" },
  { code: "kitchen_delay", label: "Kitchen delay" },
  { code: "quality_issue", label: "Quality / remake" },
  { code: "other", label: "Other reason" },
] as const;

type Line = {
  configKey: string;
  product: Product;
  qty: number;
  selectedOptions: SelectedOption[];
  unitPrice: number;
  instructions?: string;
  // How many of qty the kitchen already has (sent with a KOT).
  sentQty?: number;
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
  // The table's running kitchen order, once a KOT has been sent.
  orderId?: string | null;
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
  customerTabs?: CustomerTab[];
  posCoupons?: Coupon[];
  requestedTable?: string | null;
  restaurantSlug: string;
  restaurantName: string;
  staffEmail: string;
  staffRoleLabel: string;
  // False for captains: they build table orders but don't settle bills,
  // give discounts or set packing charges.
  canTakePayment: boolean;
  // False for captains: restricted strictly to Dine-in / Floor table orders.
  canTakeNonTableOrders: boolean;
  // True for managers & admins: may void items already sent to the kitchen.
  canVoidSentItems: boolean;
  // False for cashiers and captains: admin area & settings links are hidden.
  canOpenAdmin: boolean;
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
  customerTabs = [],
  posCoupons = [],
  requestedTable = null,
  restaurantSlug,
  restaurantName,
  staffEmail,
  staffRoleLabel,
  canTakePayment,
  canTakeNonTableOrders,
  canVoidSentItems,
  canOpenAdmin,
}: Props) {
  const router = useRouter();
  const outletId = outlet.id;
  const [switchingOutlet, startOutletSwitch] = useTransition();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [vegFilter, setVegFilter] = useState<VegFilter>("all");
  const [tabs, setTabs] = useState<Tab[]>(() =>
    canTakeNonTableOrders ? [makeDefaultTab()] : [],
  );
  const [activeTabId, setActiveTabId] = useState<string>(
    canTakeNonTableOrders ? DEFAULT_TAB_ID : "",
  );
  const [tabsLoaded, setTabsLoaded] = useState(false);
  const [mobilePane, setMobilePane] = useState<"menu" | "bill">("menu");
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
  const [sendingKot, setSendingKot] = useState(false);
  const [movingTable, setMovingTable] = useState(false);
  const [modProduct, setModProduct] = useState<Product | null>(null);
  const [editingLineNoteKey, setEditingLineNoteKey] = useState<string | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  // Manager / Admin Void Sent Item dialog state
  const [voidTargetLine, setVoidTargetLine] = useState<Line | null>(null);
  const [voidQty, setVoidQty] = useState<number>(1);
  const [voidReason, setVoidReason] = useState<string>("customer_changed_mind");
  const [voidNote, setVoidNote] = useState<string>("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

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

  // Customer Tab (Khata) dialog state
  const [khataModalOpen, setKhataModalOpen] = useState(false);
  const [khataSearch, setKhataSearch] = useState("");
  const [selectedKhataId, setSelectedKhataId] = useState<string>(
    customerTabs[0]?.id ?? "",
  );
  const [khataAllowOverLimit, setKhataAllowOverLimit] = useState(false);
  const [khataBusy, setKhataBusy] = useState(false);
  const [khataError, setKhataError] = useState<string | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const lines = activeTab?.lines ?? [];
  const orderType: OrderType = canTakeNonTableOrders
    ? (activeTab?.orderType ?? "dine-in")
    : "dine-in";
  const customerName = activeTab?.customerName ?? "";
  const orderNote = activeTab?.orderNote ?? "";
  const packingCharge = Number(activeTab?.packingCharge ?? 0);
  const discountPct = Number(activeTab?.discountPct ?? 0);
  const discountFlat = Number(activeTab?.discountFlat ?? 0);
  const [kotSavedMsg, setKotSavedMsg] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTabsLoaded(false);
    setTabs(canTakeNonTableOrders ? [makeDefaultTab()] : []);
    setActiveTabId(canTakeNonTableOrders ? DEFAULT_TAB_ID : "");
    listTabsAction(restaurantSlug, outletId)
      .then((dbTabs) => {
        if (cancelled) return;
        const mapped: Tab[] = dbTabs.map((t) => ({
          id: t.id,
          name: t.name,
          lines: (t.lines as Line[]) ?? [],
          orderType: "dine-in",
          createdAt: t.createdAt,
          persisted: true,
          orderId: t.orderId,
        }));
        const all = canTakeNonTableOrders ? [makeDefaultTab(), ...mapped] : mapped;
        setTabs(all);
        setTabsLoaded(true);
        if (requestedTable) {
          const reqNorm = requestedTable.split("·")[0].trim().toLowerCase();
          const match = mapped.find(
            (t) =>
              t.name.toLowerCase() === requestedTable.toLowerCase() ||
              t.name.split("·")[0].trim().toLowerCase() === reqNorm,
          );
          if (match) {
            setActiveTabId(match.id);
            return;
          }
        }
        if (!canTakeNonTableOrders && mapped[0]) {
          setActiveTabId(mapped[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setTabsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug, outletId, requestedTable, canTakeNonTableOrders]);

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
    if (tab?.orderId) {
      setError(`${tab.name.split("·")[0].trim()} has a kitchen order. Settle the bill before closing it.`);
      return;
    }
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
      if (!activeTab) {
        setTableModalOpen(true);
        return;
      }
      if (product.has_addons) {
        setModProduct(product);
      } else {
        addLine(product);
      }
    },
    [activeTab, addLine],
  );

  const setQty = (configKey: string, qty: number) => {
    updateActiveLines((prev) => {
      // Items already sent to the kitchen stay on the bill; voiding them is a
      // separate (manager) step.
      const sent = prev.find((l) => l.configKey === configKey)?.sentQty ?? 0;
      const next = Math.max(qty, sent);
      return next <= 0
        ? prev.filter((l) => l.configKey !== configKey)
        : prev.map((l) => (l.configKey === configKey ? { ...l, qty: next } : l));
    });
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

  const transferCurrentBillTo = async (targetTabId: string) => {
    if (!activeTab || activeTab.lines.length === 0 || targetTabId === activeTabId || movingTable) {
      return;
    }
    const targetTab = tabs.find((t) => t.id === targetTabId);
    if (!targetTab) return;

    if (activeTab.orderId && !targetTab.persisted) {
      setError("A table with a kitchen order can only be moved to another floor table, not the Counter.");
      setTableModalOpen(false);
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);

    if (activeTab.persisted && targetTab.persisted) {
      setMovingTable(true);
      setError(null);
      try {
        const res = await moveTabAction(
          restaurantSlug,
          activeTab.id,
          targetTab.id,
          activeTab.lines,
        );
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id === activeTab.id) {
              return { ...t, lines: [], orderId: null };
            }
            if (t.id === targetTab.id) {
              return {
                ...t,
                lines: res.targetLines as Line[],
                orderId: res.targetOrderId,
              };
            }
            return t;
          }),
        );
        setActiveTabId(targetTab.id);
        setTableModalOpen(false);
        const dstShort = targetTab.name.split("·")[0].trim();
        setKotSavedMsg(`Moved table order to ${dstShort}`);
        setTimeout(() => setKotSavedMsg(null), 3000);
      } finally {
        setMovingTable(false);
      }
      return;
    }

    // Walk-in Counter (unpersisted) → Floor table transfer
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

  function openVoidModal(line: Line) {
    setVoidTargetLine(line);
    setVoidQty(1);
    setVoidReason("customer_changed_mind");
    setVoidNote("");
    setVoidError(null);
  }

  async function handleConfirmVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!voidTargetLine || !activeTab?.persisted || voidBusy) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setVoidBusy(true);
    setVoidError(null);
    try {
      const res = await voidSentItemAction(restaurantSlug, activeTab.id, {
        configKey: voidTargetLine.configKey,
        quantity: voidQty,
        reason: voidReason,
        note: voidNote,
        currentLines: activeTab.lines,
      });
      if (!res.ok) {
        setVoidError(res.error);
        return;
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id
            ? { ...t, lines: res.lines as Line[], orderId: res.orderId }
            : t,
        ),
      );
      setVoidTargetLine(null);
      setKotSavedMsg(`Voided ${voidQty}× ${voidTargetLine.product.name}`);
      setTimeout(() => setKotSavedMsg(null), 3000);
    } finally {
      setVoidBusy(false);
    }
  }

  // Send KOT: the table's new items go to the kitchen board now. The first
  // KOT creates the table's running order; later ones add to it. A walk-in
  // bill on the Counter becomes a held table first.
  const holdAndSendKot = useCallback(async () => {
    if (!activeTab || activeTab.lines.length === 0 || sendingKot) return;
    setSendingKot(true);
    setError(null);
    // A pending debounced save would overwrite the sent markers.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    try {
      let tab = activeTab;
      if (!tab.persisted) {
        const created = await createTabAction(
          restaurantSlug,
          outletId,
          customerName.trim() || `Table Hold ${tabs.length}`,
        );
        if (!created.ok) {
          setError(created.error);
          return;
        }
        const held: Tab = {
          ...tab,
          id: created.tab.id,
          name: created.tab.name,
          createdAt: created.tab.createdAt,
          persisted: true,
          orderId: null,
        };
        setTabs((prev) => [
          ...prev.map((t) => (t.id === tab.id ? { ...t, lines: [] } : t)),
          held,
        ]);
        setActiveTabId(held.id);
        tab = held;
        // Keep the items even if the kitchen step below fails.
        await saveTabAction(restaurantSlug, held.id, held.name, held.lines).catch(() => {});
      }

      const res = await sendKotAction(
        restaurantSlug,
        tab.id,
        tab.name,
        tab.lines,
        customerName,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tab.id ? { ...t, lines: res.lines as Line[], orderId: res.orderId } : t,
        ),
      );
      const short = tab.name.split("·")[0].trim();
      setKotSavedMsg(
        res.sentItems > 0
          ? `Sent ${res.sentItems} ${res.sentItems === 1 ? "item" : "items"} to the kitchen for ${short}${res.tokenNumber ? ` · Token #${res.tokenNumber}` : ""}`
          : `Nothing new to send for ${short}`,
      );
      setTimeout(() => setKotSavedMsg(null), 3200);
    } finally {
      setSendingKot(false);
    }
  }, [activeTab, sendingKot, restaurantSlug, outletId, customerName, tabs.length]);

  const tender = useCallback(
    async (mode: Tender) => {
      if (!canTakePayment || lines.length === 0 || posting) return;
      setPosting(mode);
      setError(null);

      // A table with a running kitchen order is settled in place: same
      // order, now with the discount, rounding and payment mode.
      if (activeTab?.persisted && activeTab.orderId) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        const settled = await settleTabAction(restaurantSlug, activeTab.id, {
          mode,
          lines: activeTab.lines,
          customerName: customerName.trim() || undefined,
          note: orderNote.trim() || undefined,
          discountPct,
          discountFlat,
        });
        if (!settled.ok) {
          setError(settled.error);
          setPosting(null);
          return;
        }
        clearSettledActiveTab();
        router.push(`/r/${restaurantSlug}/pos/receipt/${settled.orderId}`);
        return;
      }

      const tabTableCode =
        activeTab && activeTab.id !== DEFAULT_TAB_ID
          ? activeTab.name.split("·")[0].trim()
          : "";
      const resolvedCustomer = tabTableCode
        ? customerName.trim()
          ? `${tabTableCode} · ${customerName.trim()}`
          : tabTableCode
        : customerName.trim() || "Walk-in";

      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outlet_id: outletId,
            table_id:
              activeTab?.persisted && orderType === "dine-in"
                ? activeTab.id
                : null,
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
      canTakePayment,
      discountPct,
      discountFlat,
    ],
  );

  function clearSettledActiveTab() {
    const settledId = activeTabId;
    const wasPersisted = activeTab?.persisted;
    const isFloorTable = Boolean(activeTab?.name.includes("·"));
    if (isFloorTable && activeTab) {
      setTabs((prev) =>
        prev.map((t) => (t.id === settledId ? { ...t, lines: [], orderId: null } : t)),
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

  function resolvePosCustomerDisplay(): string {
    const code =
      activeTab && activeTab.id !== DEFAULT_TAB_ID
        ? activeTab.name.split("·")[0].trim()
        : "";
    if (code) {
      return customerName.trim() ? `${code} · ${customerName.trim()}` : code;
    }
    return customerName.trim() || "Walk-in";
  }

  async function handleConfirmChargeToKhata(e: React.FormEvent) {
    e.preventDefault();
    if (!canTakePayment || lines.length === 0 || !selectedKhataId || khataBusy) {
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setKhataBusy(true);
    setKhataError(null);
    try {
      const res = await chargePosToCustomerTabAction(restaurantSlug, {
        customerTabId: selectedKhataId,
        outletId,
        posTabId: activeTab?.persisted ? activeTab.id : null,
        hasRunningOrder: Boolean(activeTab?.persisted && activeTab.orderId),
        orderType,
        customerName: customerName.trim() || undefined,
        note: orderNote.trim() || undefined,
        packingCharge,
        discountPct,
        discountFlat,
        roundingAmount: totals.rounding,
        allowOverLimit: khataAllowOverLimit,
        lines: activeTab?.lines ?? [],
        pricingItems: lines.map((l) => ({
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
          },
        })),
      });
      if (!res.ok) {
        setKhataError(res.error);
        return;
      }
      setKhataModalOpen(false);
      clearSettledActiveTab();
      router.push(`/r/${restaurantSlug}/pos/receipt/${res.orderId}`);
    } finally {
      setKhataBusy(false);
    }
  }

  /**
   * When settling a table that already has a running kitchen order via Razorpay
   * or Stripe, flush any unsent lines first so `order_items` on the running
   * order is complete before creating the gateway payment session.
   */
  async function syncRunningOrderBeforeGateway(): Promise<{
    ok: true;
    existingOrderId: string | null;
    posTabId: string | null;
  } | { ok: false; error: string }> {
    if (!activeTab?.persisted || !activeTab.orderId) {
      return {
        ok: true,
        existingOrderId: null,
        posTabId: activeTab?.persisted ? activeTab.id : null,
      };
    }
    const hasUnsent = activeTab.lines.some((l) => l.qty > (l.sentQty ?? 0));
    if (!hasUnsent) {
      return {
        ok: true,
        existingOrderId: activeTab.orderId,
        posTabId: activeTab.id,
      };
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const kotRes = await sendKotAction(
      restaurantSlug,
      activeTab.id,
      activeTab.name,
      activeTab.lines,
      customerName,
    );
    if (!kotRes.ok) return kotRes;
    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id
          ? { ...t, lines: kotRes.lines as Line[], orderId: kotRes.orderId }
          : t,
      ),
    );
    return {
      ok: true,
      existingOrderId: kotRes.orderId ?? activeTab.orderId,
      posTabId: activeTab.id,
    };
  }

  async function handleRazorpayPosCheckout() {
    if (lines.length === 0 || onlineBusy) return;
    setOnlineBusy(true);
    setOnlineError(null);

    const resolvedCustomer = resolvePosCustomerDisplay();

    try {
      const synced = await syncRunningOrderBeforeGateway();
      if (!synced.ok) throw new Error(synced.error);

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
          table_id:
            activeTab?.persisted && orderType === "dine-in"
              ? activeTab.id
              : null,
          existing_order_id: synced.existingOrderId,
          pos_tab_id: synced.posTabId,
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
              body: JSON.stringify({ outlet_id: outletId, ...resp }),
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

    const resolvedCustomer = resolvePosCustomerDisplay();

    try {
      const synced = await syncRunningOrderBeforeGateway();
      if (!synced.ok) throw new Error(synced.error);

      const res = await fetch("/api/payments/stripe/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outlet_id: outletId,
          restaurant_slug: restaurantSlug,
          table_id:
            activeTab?.persisted && orderType === "dine-in"
              ? activeTab.id
              : null,
          existing_order_id: synced.existingOrderId,
          pos_tab_id: synced.posTabId,
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
      if (!canTakePayment) return;
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
  }, [tender, lines.length, canTakePayment]);

  const totalItems = lines.reduce((s, l) => s + l.qty, 0);
  const floorTablesCount = tabs.filter((t) => t.id !== DEFAULT_TAB_ID).length;
  const occupiedTablesCount = tabs.filter(
    (t) => t.id !== DEFAULT_TAB_ID && t.lines.length > 0,
  ).length;

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground select-none">
      {/* Top operational bar */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 md:h-13 md:flex-nowrap md:gap-3 md:py-0">
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
            <SelectTrigger size="sm" className="w-36 sm:w-40">
              <SelectValue>
                {outlets.find((o) => String(o.id) === String(outletId))?.name ??
                  outlet.name}
              </SelectValue>
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

        {/* Quick links to Tables, Kitchen & Admin */}
        <div className="ml-auto flex items-center gap-1.5 md:order-last md:ml-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTableModalOpen(true)}
            className="h-8 px-2.5 text-xs"
            title="Select Floor Table"
          >
            <LayoutGrid className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">
              Tables ({occupiedTablesCount}/{floorTablesCount})
            </span>
          </Button>
          <Link
            href={
              canOpenAdmin
                ? `/r/${restaurantSlug}/admin/kitchen`
                : `/r/${restaurantSlug}/kitchen`
            }
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 px-2.5 text-xs",
            )}
            title="Open Kitchen Display"
          >
            <ChefHat className="h-3.5 w-3.5 sm:mr-1" />
            <span className="hidden sm:inline">KDS</span>
          </Link>
          {canOpenAdmin && (
            <Link
              href={`/r/${restaurantSlug}/admin`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden h-8 text-xs lg:inline-flex",
              )}
              title="Open Admin Portal"
            >
              <LayoutDashboard className="mr-1 h-3.5 w-3.5" />
              Admin
            </Link>
          )}
          <PwaInstallButton variant="compact" />
          <FullscreenToggle />
        </div>

        {/* Search input with Enter-to-add */}
        <div className="relative order-last w-full md:order-none md:ml-auto md:w-64 lg:w-80">
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
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-block">
            ↵ Add
          </kbd>
        </div>

        {/* Dietary filter */}
        <div className="hidden items-center rounded-[10px] bg-muted p-0.5 lg:flex">
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
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left: Menu Catalog */}
        <section
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-background",
            mobilePane === "bill" && "hidden md:flex",
          )}
        >
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
        <aside
          className={cn(
            "flex w-full shrink-0 flex-col border-l border-border bg-card md:w-88 lg:w-96",
            mobilePane === "menu" && "hidden md:flex",
          )}
        >
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
                    {canTakeNonTableOrders &&
                      t.id !== DEFAULT_TAB_ID &&
                      !isFloorTable && (
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

            {!canTakeNonTableOrders && tabsLoaded && tabs.length === 0 && (
              <span className="px-1.5 text-[11px] text-muted-foreground">
                No floor tables configured
              </span>
            )}

            {canTakeNonTableOrders &&
              (creatingTab ? (
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
              ))}
          </div>

          {/* Order Type selector + Customer/Notes toggle */}
          <div className="space-y-2 border-b border-border p-2.5">
            {canTakeNonTableOrders ? (
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
            ) : (
              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                  <Utensils className="h-3.5 w-3.5 text-muted-foreground" />
                  Dine-in ·{" "}
                  {activeTab
                    ? activeTab.name.split("·")[0].trim()
                    : "Select a floor table"}
                </span>
                <button
                  type="button"
                  onClick={() => setTableModalOpen(true)}
                  className="font-medium text-primary hover:underline"
                >
                  Switch table
                </button>
              </div>
            )}

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
                {canTakePayment && orderType !== "dine-in" && (
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
                {canTakePayment && (
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
                  {posCoupons.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Tag className="h-2.5 w-2.5" />
                        Coupons:
                      </span>
                      {posCoupons.slice(0, 6).map((cp) => (
                        <button
                          key={cp.id}
                          type="button"
                          title={formatCouponOfferLabel(cp)}
                          onClick={() => {
                            const ev = evaluateCouponDiscount(cp, totals.subtotal, {
                              channel: orderType === "dine-in" ? "dine_in" : "pos",
                            });
                            if (!ev.ok) {
                              setError(ev.reason);
                              return;
                            }
                            setError(null);
                            updateActiveTab((t) => ({
                              ...t,
                              discountPct:
                                cp.discount_type === "percentage" && !cp.max_discount
                                  ? Number(cp.discount_value)
                                  : 0,
                              discountFlat:
                                cp.discount_type === "percentage" && !cp.max_discount
                                  ? 0
                                  : ev.discount,
                            }));
                          }}
                          className="rounded border border-dashed border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground hover:border-primary hover:text-primary"
                        >
                          {cp.code}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                )}
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
            {lines.map((line) => {
              const {
                configKey,
                product,
                qty,
                selectedOptions,
                unitPrice,
                instructions,
                sentQty = 0,
              } = line;
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
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                        <span>
                          ₹{unitPrice.toFixed(0)} × {qty}
                        </span>
                        {sentQty > 0 && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1 font-medium text-emerald-700">
                            <ChefHat className="h-2.5 w-2.5" />
                            {sentQty >= qty ? "Sent" : `${sentQty} sent`}
                          </span>
                        )}
                        {sentQty > 0 &&
                          canVoidSentItems &&
                          activeTab?.persisted &&
                          activeTab.orderId && (
                            <button
                              type="button"
                              onClick={() => openVoidModal(line)}
                              className="rounded bg-destructive/10 px-1.5 py-0.2 text-[10px] font-medium text-destructive transition hover:bg-destructive/20"
                              title="Void sent item (Manager / Admin)"
                            >
                              Void
                            </button>
                          )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-xs"
                        onClick={() => setQty(configKey, qty - 1)}
                        disabled={qty <= sentQty}
                        title={qty <= sentQty ? "Already sent to the kitchen" : undefined}
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
            })}
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
                disabled={
                  sendingKot ||
                  posting !== null ||
                  !lines.some((l) => l.qty > (l.sentQty ?? 0))
                }
                className="flex-1 text-xs font-medium"
                title="Send new items to the kitchen"
              >
                <ChefHat className="mr-1.5 h-3.5 w-3.5" />
                {sendingKot ? "Sending…" : "Send KOT"}
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

            {canTakePayment ? (
            <>
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
              type="button"
              variant="outline"
              size="sm"
              disabled={lines.length === 0 || posting !== null}
              onClick={() => {
                setKhataError(null);
                setKhataAllowOverLimit(false);
                if (!selectedKhataId && customerTabs[0]) {
                  setSelectedKhataId(customerTabs[0].id);
                }
                setKhataModalOpen(true);
              }}
              className="mt-1.5 w-full justify-between text-xs font-medium"
            >
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0" />
                <span>Charge to Customer Tab (Khata)</span>
              </span>
              {customerTabs.length > 0 && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {customerTabs.length}
                </span>
              )}
            </Button>
            </>
            ) : (
              <p className="mt-3 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
                Captains take orders; the bill is settled at the counter.
                Use <span className="font-medium text-foreground">Send KOT</span> to send
                new items to the kitchen.
              </p>
            )}

            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                // Items the kitchen already has stay; only unsent ones go.
                updateActiveLines((prev) =>
                  prev
                    .filter((l) => (l.sentQty ?? 0) > 0)
                    .map((l) => ({ ...l, qty: l.sentQty ?? l.qty })),
                )
              }
              disabled={!lines.some((l) => l.qty > (l.sentQty ?? 0)) || posting !== null}
              className="mt-1.5 w-full text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" /> Clear current bill
            </Button>
          </div>
        </aside>
      </div>

      {/* Phone-friendly bottom switcher for Captains & floor staff */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-2.5 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setTableModalOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-xs font-medium text-foreground"
        >
          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="max-w-24 truncate">
            {activeTab
              ? activeTab.name.split("·")[0].trim()
              : "Pick table"}
          </span>
        </button>

        <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMobilePane("menu")}
            className={cn(
              "rounded-md py-1.5 text-xs font-semibold transition-colors",
              mobilePane === "menu"
                ? "bg-card text-foreground shadow-control"
                : "text-muted-foreground",
            )}
          >
            Menu
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("bill")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors",
              mobilePane === "bill"
                ? "bg-card text-foreground shadow-control"
                : "text-muted-foreground",
            )}
          >
            <span>Bill</span>
            <span className="rounded-full bg-primary/15 px-1.5 py-0.2 text-[11px] tabular-nums text-foreground">
              {totalItems} · ₹{totals.total.toFixed(0)}
            </span>
          </button>
        </div>

        {mobilePane === "menu" && lines.some((l) => l.qty > (l.sentQty ?? 0)) && (
          <Button
            type="button"
            size="sm"
            onClick={holdAndSendKot}
            disabled={sendingKot}
            className="h-8 shrink-0 px-2.5 text-xs"
          >
            <ChefHat className="mr-1 h-3.5 w-3.5" />
            {sendingKot ? "…" : "KOT"}
          </Button>
        )}
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
                {!paymentConfig.upiVpa && canOpenAdmin && (
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
                  {canOpenAdmin ? (
                    <Link
                      href={`/r/${restaurantSlug}/admin/settings`}
                      className="font-medium text-foreground underline"
                    >
                      Admin Settings
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">Admin Settings</span>
                  )}
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
                    {canOpenAdmin ? (
                      <Link
                        href={`/r/${restaurantSlug}/admin/settings`}
                        className="font-semibold underline"
                      >
                        Outlet Settings
                      </Link>
                    ) : (
                      <span className="font-semibold">Outlet Settings</span>
                    )}{" "}
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
                    {canOpenAdmin ? (
                      <Link
                        href={`/r/${restaurantSlug}/admin/settings`}
                        className="font-semibold underline"
                      >
                        Outlet Settings
                      </Link>
                    ) : (
                      <span className="font-semibold">Outlet Settings</span>
                    )}{" "}
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
                  {floorTablesCount} Tables ·{" "}
                  {tabs.reduce((sum, t) => {
                    const m = t.name.match(/(\d+)\s*p/i);
                    return sum + (m ? Number(m[1]) : 0);
                  }, 0)}{" "}
                  Seats
                </Badge>
              </div>
              {canOpenAdmin && (
                <Link
                  href={`/r/${restaurantSlug}/admin/tables`}
                  className="text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
                >
                  Manage Floor Plan & Capacity →
                </Link>
              )}
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
                              if (!movingTable) transferCurrentBillTo(t.id);
                            }}
                            className="mt-1.5 rounded border border-dashed border-border bg-muted/50 py-0.5 text-center text-[10px] font-medium text-muted-foreground hover:border-primary hover:text-foreground"
                          >
                            {movingTable
                              ? "Moving…"
                              : qty > 0
                                ? "Merge here"
                                : "Transfer here"}
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

      {/* Manager / Admin Void Sent Item Dialog */}
      <Dialog
        open={voidTargetLine !== null}
        onOpenChange={(open) => {
          if (!open && !voidBusy) setVoidTargetLine(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Void kitchen item</DialogTitle>
            <DialogDescription>
              Remove items already sent to the kitchen for{" "}
              <span className="font-medium text-foreground">
                {activeTab?.name.split("·")[0].trim() || "Table"}
              </span>
              . This is logged against the running order with your reason.
            </DialogDescription>
          </DialogHeader>

          {voidTargetLine && (
            <form onSubmit={handleConfirmVoid} className="space-y-3.5">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                <div className="font-semibold text-foreground">
                  {voidTargetLine.product.name}
                </div>
                {voidTargetLine.selectedOptions.length > 0 && (
                  <div className="mt-0.5 text-muted-foreground">
                    {voidTargetLine.selectedOptions
                      .map((o) => o.option_name)
                      .join(" · ")}
                  </div>
                )}
                <div className="mt-1 tabular-nums text-muted-foreground">
                  Sent to kitchen: {voidTargetLine.sentQty ?? 0} · ₹
                  {voidTargetLine.unitPrice.toFixed(0)} each
                </div>
              </div>

              {(voidTargetLine.sentQty ?? 1) > 1 && (
                <div className="space-y-1.5">
                  <Label htmlFor="void-qty" className="text-xs">
                    Quantity to void
                  </Label>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      disabled={voidQty <= 1 || voidBusy}
                      onClick={() => setVoidQty((q) => Math.max(1, q - 1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      id="void-qty"
                      type="number"
                      min={1}
                      max={voidTargetLine.sentQty ?? 1}
                      value={voidQty}
                      onChange={(e) => {
                        const max = voidTargetLine.sentQty ?? 1;
                        const val = Math.max(
                          1,
                          Math.min(max, Number(e.target.value) || 1),
                        );
                        setVoidQty(val);
                      }}
                      className="h-8 w-20 text-center text-xs tabular-nums"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      disabled={
                        voidQty >= (voidTargetLine.sentQty ?? 1) || voidBusy
                      }
                      onClick={() =>
                        setVoidQty((q) =>
                          Math.min(voidTargetLine.sentQty ?? 1, q + 1),
                        )
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      of {voidTargetLine.sentQty ?? 1} sent
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Reason</Label>
                <Select
                  value={voidReason}
                  onValueChange={(v) => {
                    if (v) setVoidReason(v);
                  }}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue>
                      {VOID_REASONS.find((r) => r.code === voidReason)?.label ??
                        "Select reason"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {VOID_REASONS.map((r) => (
                      <SelectItem key={r.code} value={r.code}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="void-note" className="text-xs">
                  Additional note (optional)
                </Label>
                <Textarea
                  id="void-note"
                  rows={2}
                  value={voidNote}
                  onChange={(e) => setVoidNote(e.target.value)}
                  placeholder="Optional details for manager report…"
                  className="text-xs"
                />
              </div>

              {voidError && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {voidError}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={voidBusy}
                  onClick={() => setVoidTargetLine(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  size="sm"
                  disabled={voidBusy}
                >
                  {voidBusy ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Voiding…
                    </>
                  ) : (
                    `Void ${voidQty} ${voidQty === 1 ? "item" : "items"}`
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Charge to Customer Tab (Khata) Dialog */}
      <Dialog
        open={khataModalOpen}
        onOpenChange={(open) => {
          if (!open && !khataBusy) setKhataModalOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Charge Bill to Customer Tab (Khata)</DialogTitle>
            <DialogDescription>
              Post ₹{totals.total.toFixed(0)} onto a regular patron&apos;s running credit ledger for weekly or monthly settlement.
            </DialogDescription>
          </DialogHeader>

          {customerTabs.length === 0 ? (
            <div className="space-y-3 py-2 text-xs text-muted-foreground">
              <p>No active customer credit tabs have been opened yet.</p>
              {canOpenAdmin && (
                <Link
                  href={`/r/${restaurantSlug}/admin/accounts`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Open a Customer Tab in Admin
                </Link>
              )}
            </div>
          ) : (
            <form onSubmit={handleConfirmChargeToKhata} className="space-y-3.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={khataSearch}
                  onChange={(e) => setKhataSearch(e.target.value)}
                  placeholder="Filter customer tabs…"
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <div className="max-h-60 space-y-1.5 overflow-y-auto pr-0.5">
                {customerTabs
                  .filter((t) => {
                    const q = khataSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      t.customer_name.toLowerCase().includes(q) ||
                      (t.phone ?? "").toLowerCase().includes(q) ||
                      (t.company_or_notes ?? "").toLowerCase().includes(q)
                    );
                  })
                  .map((t) => {
                    const bal = Number(t.current_balance ?? 0);
                    const lim = Number(t.credit_limit ?? 0);
                    const selected = selectedKhataId === t.id;
                    const wouldExceed = lim > 0 && bal + totals.total > lim;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedKhataId(t.id)}
                        className={cn(
                          "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                          selected
                            ? "border-primary bg-primary/8"
                            : "border-border bg-card hover:bg-muted/40",
                        )}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground">
                            {t.customer_name}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {[t.phone, t.company_or_notes]
                              .filter(Boolean)
                              .join(" · ") || "Active Tab"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right tabular-nums">
                          <div className="font-semibold">
                            ₹{bal.toFixed(0)}{" "}
                            <span className="font-normal text-muted-foreground">
                              / ₹{lim.toFixed(0)}
                            </span>
                          </div>
                          {wouldExceed && (
                            <div className="text-[10px] font-medium text-amber-700">
                              Over limit with bill
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>

              {canVoidSentItems && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={khataAllowOverLimit}
                    onChange={(e) => setKhataAllowOverLimit(e.target.checked)}
                  />
                  Manager override if charge exceeds credit limit
                </label>
              )}

              {khataError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {khataError}
                </p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={khataBusy}
                  onClick={() => setKhataModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!selectedKhataId || khataBusy}
                >
                  {khataBusy ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Posting…
                    </>
                  ) : (
                    `Post ₹${totals.total.toFixed(0)} to Khata`
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
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
