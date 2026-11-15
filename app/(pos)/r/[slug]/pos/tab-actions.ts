"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSb } from "@supabase/supabase-js";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import {
  ADMIN_AREA_ROLES,
  BILLING_ROLES,
  POS_ROLES,
} from "@/lib/roles";
import {
  configKeyForPosLine,
  moveTabOrder,
  sendKotForTab,
  settleTab,
  voidSentItemForTab,
  type PosLine,
  type SettleInput,
  type TabRow,
} from "@/lib/running-orders";

function rawAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service env missing");
  return createSb(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TabLine = unknown; // opaque to the server; the POS owns the shape
export type PosTab = {
  id: string;
  name: string;
  lines: TabLine[];
  createdAt: number;
  // The table's running kitchen order, once a KOT has been sent.
  orderId: string | null;
};

async function authRestaurant(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  const { user, role } = await requireRole(POS_ROLES, {
    restaurantId: restaurant.id,
  });
  return { restaurant, user, role };
}

async function outletInRestaurant(
  db: ReturnType<typeof rawAdmin>,
  outletId: string,
  restaurantId: string,
) {
  const { data } = await db
    .from("outlets")
    .select("restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  return !!data && data.restaurant_id === restaurantId;
}

export async function listTabsAction(
  slug: string,
  outletId: string,
): Promise<PosTab[]> {
  const ctx = await authRestaurant(slug);
  if (!ctx) return [];
  const db = rawAdmin();
  if (!(await outletInRestaurant(db, outletId, ctx.restaurant.id))) return [];

  const { data } = await db
    .from("pos_tabs")
    .select("*")
    .eq("outlet_id", outletId)
    .order("created_at", { ascending: true });

  return (data ?? []).map(
    (r: {
      id: string;
      name: string;
      lines: unknown;
      created_at: string;
      order_id?: string | null;
    }) => ({
      id: r.id,
      name: r.name,
      lines: Array.isArray(r.lines) ? (r.lines as TabLine[]) : [],
      createdAt: new Date(r.created_at).getTime(),
      orderId: r.order_id ?? null,
    }),
  );
}

/**
 * Ad-hoc walk-in tabs ("+ Hold" or turning Counter into a tab): restricted to
 * billing staff (`BILLING_ROLES`). Captains take orders on configured floor
 * tables only.
 */
export async function createTabAction(
  slug: string,
  outletId: string,
  name: string,
): Promise<{ ok: true; tab: PosTab } | { ok: false; error: string }> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Not allowed" };
  await requireRole(BILLING_ROLES, { restaurantId: restaurant.id });

  const db = rawAdmin();
  if (!(await outletInRestaurant(db, outletId, restaurant.id))) {
    return { ok: false, error: "Unknown outlet" };
  }

  const { data, error } = await db
    .from("pos_tabs")
    .insert({ outlet_id: outletId, name: name.trim() || "Tab", lines: [] })
    .select("id, name, lines, created_at")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create tab" };
  }
  return {
    ok: true,
    tab: {
      id: data.id,
      name: data.name,
      lines: [],
      createdAt: new Date(data.created_at).getTime(),
      orderId: null,
    },
  };
}

export async function saveTabAction(
  slug: string,
  tabId: string,
  name: string,
  lines: TabLine[],
): Promise<{ ok: boolean }> {
  const ctx = await authRestaurant(slug);
  if (!ctx) return { ok: false };
  const db = rawAdmin();

  const { data: tab } = await db
    .from("pos_tabs")
    .select("outlet_id, order_id, lines")
    .eq("id", tabId)
    .maybeSingle();
  if (!tab || !(await outletInRestaurant(db, tab.outlet_id, ctx.restaurant.id))) {
    return { ok: false };
  }

  // Never let a client autosave reduce sentQty on an active running kitchen order
  let safeLines = Array.isArray(lines) ? (lines as PosLine[]) : [];
  if (tab.order_id && Array.isArray(tab.lines)) {
    const sentByKey = new Map<string, PosLine>();
    for (const oldLine of tab.lines as PosLine[]) {
      const sent = Math.max(0, Math.floor(Number(oldLine.sentQty) || 0));
      if (sent > 0) {
        sentByKey.set(configKeyForPosLine(oldLine), oldLine);
      }
    }
    const nextMap = new Map<string, PosLine>();
    for (const incoming of safeLines) {
      const k = configKeyForPosLine(incoming);
      const prevSentLine = sentByKey.get(k);
      const minSent = prevSentLine
        ? Math.max(0, Math.floor(Number(prevSentLine.sentQty) || 0))
        : 0;
      const incomingQty = Math.max(0, Math.floor(Number(incoming.qty) || 0));
      nextMap.set(k, {
        ...incoming,
        qty: Math.max(minSent, incomingQty),
        sentQty: minSent,
      });
    }
    // Re-add any sent line missing from incoming client state
    for (const [k, prevSentLine] of sentByKey) {
      if (!nextMap.has(k)) {
        const minSent = Math.max(0, Math.floor(Number(prevSentLine.sentQty) || 0));
        nextMap.set(k, { ...prevSentLine, qty: minSent, sentQty: minSent });
      }
    }
    safeLines = [...nextMap.values()];
  }

  const { error } = await db
    .from("pos_tabs")
    .update({
      name: name.trim() || "Tab",
      lines: safeLines,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tabId);
  return { ok: !error };
}

export async function deleteTabAction(
  slug: string,
  tabId: string,
): Promise<{ ok: boolean; error?: string }> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Not allowed" };
  await requireRole(BILLING_ROLES, { restaurantId: restaurant.id });
  const db = rawAdmin();

  const { data: tab } = await db
    .from("pos_tabs")
    .select("outlet_id, order_id")
    .eq("id", tabId)
    .maybeSingle();
  if (!tab || !(await outletInRestaurant(db, tab.outlet_id, restaurant.id))) {
    return { ok: false, error: "Unknown tab" };
  }
  if (tab.order_id) {
    return {
      ok: false,
      error: "Settle or void this table's active kitchen order before closing it.",
    };
  }

  const { error } = await db.from("pos_tabs").delete().eq("id", tabId);
  return { ok: !error };
}

async function loadTab(
  db: ReturnType<typeof rawAdmin>,
  tabId: string,
  restaurantId: string,
): Promise<
  | { ok: true; tab: TabRow; lines: PosLine[] }
  | { ok: false; error: string }
> {
  const { data } = await db.from("pos_tabs").select("*").eq("id", tabId).maybeSingle();
  if (!data || !(await outletInRestaurant(db, data.outlet_id, restaurantId))) {
    return { ok: false, error: "This table no longer exists. Reload the POS." };
  }
  if (!("order_id" in data)) {
    return {
      ok: false,
      error:
        "Sending KOTs needs the running-orders database update (migration 20261114091000). Apply it, then try again.",
    };
  }
  return {
    ok: true,
    tab: {
      id: data.id,
      outlet_id: data.outlet_id,
      name: data.name,
      order_id: data.order_id ?? null,
    },
    lines: Array.isArray(data.lines) ? (data.lines as PosLine[]) : [],
  };
}

function revalidateFloorAndKitchen(slug: string) {
  revalidatePath(`/r/${slug}/admin/kitchen`);
  revalidatePath(`/r/${slug}/kitchen`);
  revalidatePath(`/r/${slug}/admin/tables`);
}

/**
 * Send KOT: puts the table's new items on the kitchen board. The first KOT
 * creates the table's running order; later ones add to it. Captains may do
 * this; the lines are saved along the way.
 */
export async function sendKotAction(
  slug: string,
  tabId: string,
  name: string,
  lines: TabLine[],
  customerName?: string,
) {
  const ctx = await authRestaurant(slug);
  if (!ctx) return { ok: false as const, error: "Not allowed" };
  const db = rawAdmin();
  const loaded = await loadTab(db, tabId, ctx.restaurant.id);
  if (!loaded.ok) return loaded;

  const tab = { ...loaded.tab, name: name.trim() || loaded.tab.name };
  if (tab.name !== loaded.tab.name) {
    await db.from("pos_tabs").update({ name: tab.name }).eq("id", tabId);
  }
  const res = await sendKotForTab(
    tab,
    Array.isArray(lines) ? (lines as PosLine[]) : [],
    customerName,
  );
  if (res.ok) revalidateFloorAndKitchen(slug);
  return res;
}

/**
 * Void / remove items already sent to the kitchen on a running table order.
 * Restricted strictly to Manager / Admin (`ADMIN_AREA_ROLES`), and requires a reason.
 */
export async function voidSentItemAction(
  slug: string,
  tabId: string,
  input: {
    configKey: string;
    quantity: number;
    reason: string;
    note?: string;
    currentLines: TabLine[];
  },
): Promise<
  | { ok: true; lines: PosLine[]; orderId: string | null }
  | { ok: false; error: string }
> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Not allowed" };
  const { user, role } = await requireRole(ADMIN_AREA_ROLES, {
    restaurantId: restaurant.id,
  });

  const db = rawAdmin();
  const loaded = await loadTab(db, tabId, restaurant.id);
  if (!loaded.ok) return loaded;

  const res = await voidSentItemForTab(loaded.tab, {
    configKey: input.configKey,
    quantity: input.quantity,
    reason: input.reason,
    note: input.note,
    voidedBy: user.email ?? role,
    currentLines: Array.isArray(input.currentLines)
      ? (input.currentLines as PosLine[])
      : loaded.lines,
  });
  if (res.ok) revalidateFloorAndKitchen(slug);
  return res;
}

/**
 * Move (or merge) a table — including tables that already have an active
 * running kitchen order — onto another table in the same outlet.
 */
export async function moveTabAction(
  slug: string,
  sourceTabId: string,
  targetTabId: string,
  sourceClientLines?: TabLine[],
): Promise<
  | {
      ok: true;
      targetLines: PosLine[];
      targetOrderId: string | null;
    }
  | { ok: false; error: string }
> {
  const ctx = await authRestaurant(slug);
  if (!ctx) return { ok: false, error: "Not allowed" };
  const db = rawAdmin();

  const [srcLoaded, dstLoaded] = await Promise.all([
    loadTab(db, sourceTabId, ctx.restaurant.id),
    loadTab(db, targetTabId, ctx.restaurant.id),
  ]);
  if (!srcLoaded.ok) return srcLoaded;
  if (!dstLoaded.ok) return dstLoaded;

  const srcLines = Array.isArray(sourceClientLines)
    ? (sourceClientLines as PosLine[])
    : srcLoaded.lines;

  const res = await moveTabOrder(
    { ...srcLoaded.tab, lines: srcLines },
    { ...dstLoaded.tab, lines: dstLoaded.lines },
  );
  if (!res.ok) return res;

  revalidateFloorAndKitchen(slug);
  return {
    ok: true,
    targetLines: res.targetLines,
    targetOrderId: res.targetOrderId,
  };
}

/**
 * Settles a table with a running order: sends anything unsent, applies the
 * discount and rounding, records the payment mode and clears the table.
 * Only roles that can take payment (not captains).
 */
export async function settleTabAction(
  slug: string,
  tabId: string,
  input: SettleInput,
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Not allowed" };
  await requireRole(BILLING_ROLES, { restaurantId: restaurant.id });
  if (!["cash", "upi", "card"].includes(input?.mode)) {
    return { ok: false, error: "Pick cash, UPI or card." };
  }
  const db = rawAdmin();
  const loaded = await loadTab(db, tabId, restaurant.id);
  if (!loaded.ok) return loaded;
  const res = await settleTab(loaded.tab, {
    ...input,
    lines: Array.isArray(input.lines) ? input.lines : [],
  });
  if (res.ok) revalidateFloorAndKitchen(slug);
  return res;
}
