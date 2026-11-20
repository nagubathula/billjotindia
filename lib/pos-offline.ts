import type { ProductModifiersPayload } from "./customizations";
import type { Category, Coupon, LoyaltySettings, Outlet, Product } from "./types";

export type OfflineSplitAllocation = {
  mode: "cash" | "upi" | "card";
  amount: number;
};

export type OfflineOrderLinePayload = {
  quantity: number;
  unit_price: number;
  total_price: number;
  instructions?: string;
  product_config: {
    product_id: string;
    name: string;
    base_price: number;
    selected_options: Array<{
      group_id?: string;
      group_name?: string;
      option_id: string;
      option_name: string;
      price: number;
      quantity?: number;
    }>;
    gst_rate: number;
    hsn_code: string | null;
    tender_mode?: string;
  };
};

export type OfflineQueuedOrder = {
  offlineId: string;
  billNumber: string;
  outletId: string;
  restaurantSlug: string;
  createdAt: string;
  orderType: "dine-in" | "takeaway" | "delivery";
  paymentMode: "cash" | "upi" | "card" | "split";
  allocations?: OfflineSplitAllocation[];
  customerName: string;
  customerPhone?: string | null;
  customerEmail: string;
  instructions?: string | null;
  subtotalTaxable: number;
  cgstAmount: number;
  sgstAmount: number;
  takeawayCharges: number;
  discountAmount: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountAmount?: number;
  roundingAmount: number;
  totalAmount: number;
  items: OfflineOrderLinePayload[];
  syncStatus: "pending" | "syncing" | "failed";
  attempts: number;
  lastError?: string | null;
};

export type PosCatalogSnapshot = {
  outletId: string;
  savedAt: string;
  outlet: Outlet;
  categories: Category[];
  products: Product[];
  modifiersByProduct: Record<string, ProductModifiersPayload>;
  posCoupons: Coupon[];
  loyaltySettings: LoyaltySettings | null;
};

const DB_NAME = "billjot_pos_offline_v1";
const DB_VERSION = 1;
const STORE_CATALOG = "catalog_snapshots";
const STORE_OUTBOX = "order_outbox";

export function makeOfflineOrderId(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
      ? Array.from(crypto.getRandomValues(new Uint8Array(4)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : Math.floor(100000 + Math.random() * 900000).toString(36);
  return `off_${Date.now()}_${rand}`;
}

export function makeLocalOfflineBillNumber(now = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `OFF-${mm}${dd}-${hh}${min}${ss}`;
}

export function isNetworkFailure(err: unknown, isNavigatorOnline: boolean): boolean {
  if (!isNavigatorOnline) return true;
  if (err instanceof TypeError) return true;
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed")
  );
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CATALOG)) {
        db.createObjectStore(STORE_CATALOG, { keyPath: "outletId" });
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const store = db.createObjectStore(STORE_OUTBOX, { keyPath: "offlineId" });
        store.createIndex("by_outlet", "outletId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function savePosCatalogSnapshot(snapshot: PosCatalogSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openOfflineDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CATALOG, "readwrite");
      tx.objectStore(STORE_CATALOG).put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore storage errors
  }
}

export async function loadPosCatalogSnapshot(
  outletId: string,
): Promise<PosCatalogSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openOfflineDb();
    const result = await new Promise<PosCatalogSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_CATALOG, "readonly");
      const req = tx.objectStore(STORE_CATALOG).get(outletId);
      req.onsuccess = () => resolve((req.result as PosCatalogSnapshot) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function enqueueOfflinePosOrder(entry: OfflineQueuedOrder): Promise<void> {
  const db = await openOfflineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, "readwrite");
      tx.objectStore(STORE_OUTBOX).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function listOfflinePosOrders(
  outletId: string,
): Promise<OfflineQueuedOrder[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openOfflineDb();
    const rows = await new Promise<OfflineQueuedOrder[]>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, "readonly");
      const req = tx.objectStore(STORE_OUTBOX).index("by_outlet").getAll(outletId);
      req.onsuccess = () => resolve((req.result as OfflineQueuedOrder[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}

export async function updateOfflinePosOrderStatus(
  offlineId: string,
  patch: Partial<Pick<OfflineQueuedOrder, "syncStatus" | "attempts" | "lastError">>,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openOfflineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, "readwrite");
      const store = tx.objectStore(STORE_OUTBOX);
      const getReq = store.get(offlineId);
      getReq.onsuccess = () => {
        const cur = getReq.result as OfflineQueuedOrder | undefined;
        if (cur) {
          store.put({ ...cur, ...patch });
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function removeOfflinePosOrder(offlineId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openOfflineDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_OUTBOX, "readwrite");
      tx.objectStore(STORE_OUTBOX).delete(offlineId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function syncSingleOfflineOrder(
  entry: OfflineQueuedOrder,
): Promise<
  | { ok: true; orderId: string; deduped?: boolean }
  | { ok: false; error: string; permanent?: boolean }
> {
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        outlet_id: entry.outletId,
        source: "pos",
        offline_id: entry.offlineId,
        placed_at: entry.createdAt,
        customer_name: entry.customerName,
        customer_phone: entry.customerPhone || undefined,
        customer_email: entry.customerEmail,
        payment_mode: entry.paymentMode,
        split_allocations: entry.allocations,
        loyalty_points_redeemed: entry.loyaltyPointsRedeemed ?? 0,
        order_type: entry.orderType,
        subtotal: Number(entry.subtotalTaxable.toFixed(2)),
        takeaway_charges: Number(entry.takeawayCharges.toFixed(2)),
        discount_amount: Number(entry.discountAmount.toFixed(2)),
        rounding_amount: Number(entry.roundingAmount.toFixed(2)),
        total_amount: Number(entry.totalAmount.toFixed(2)),
        instructions: entry.instructions || undefined,
        items: entry.items,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      order?: { id: string };
      deduped?: boolean;
      error?: string;
    };
    if (!res.ok || !json.order?.id) {
      return {
        ok: false,
        error: json.error ?? `HTTP ${res.status}`,
        permanent: res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429,
      };
    }
    return { ok: true, orderId: json.order.id, deduped: Boolean(json.deduped) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error while syncing offline bill",
      permanent: false,
    };
  }
}
