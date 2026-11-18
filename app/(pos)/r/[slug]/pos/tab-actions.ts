"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient as createSb } from "@supabase/supabase-js";
import { checkTabCreditLimit, computeTabNextBalance } from "@/lib/accounts";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import type { Json } from "@/lib/database.types";
import {
  cleanNote,
  isOrderType,
  newOrderNumber,
  ORDER_NOTE_MAX,
  recomputeFirstParty,
  round2,
  type OrderItemInput,
} from "@/lib/order-pricing";
import { dispatchOrderStatusWebhooks } from "@/lib/order-webhooks";
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
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

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

export async function chargePosToCustomerTabAction(
  slug: string,
  input: {
    customerTabId: string;
    outletId: string;
    posTabId?: string | null;
    hasRunningOrder?: boolean;
    orderType: string;
    customerName?: string;
    note?: string;
    packingCharge?: number;
    discountPct?: number;
    discountFlat?: number;
    roundingAmount?: number;
    allowOverLimit?: boolean;
    lines: PosLine[];
    pricingItems: OrderItemInput[];
  },
): Promise<
  | { ok: true; orderId: string; nextBalance: number }
  | { ok: false; error: string }
> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Not allowed" };
  const { role } = await requireRole(BILLING_ROLES, {
    restaurantId: restaurant.id,
  });

  if (!isUuid(input.customerTabId)) {
    return { ok: false, error: "Select a customer Khata tab." };
  }
  if (!isUuid(input.outletId)) {
    return { ok: false, error: "Invalid outlet." };
  }

  const db = rawAdmin();
  if (!(await outletInRestaurant(db, input.outletId, restaurant.id))) {
    return { ok: false, error: "Outlet does not belong to this restaurant." };
  }

  const admin = createAdminClient();
  const { data: custTab } = await admin
    .from("customer_tabs")
    .select("*")
    .eq("id", input.customerTabId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!custTab) return { ok: false, error: "Customer tab not found." };
  if (custTab.status !== "active") {
    return { ok: false, error: "Customer tab is suspended or closed." };
  }

  const curBalance = Number(custTab.current_balance ?? 0);
  const creditLimit = Number(custTab.credit_limit ?? 0);
  const canOverrideLimit =
    Boolean(input.allowOverLimit) && ADMIN_AREA_ROLES.includes(role);

  const packing =
    input.orderType === "dine-in"
      ? 0
      : Math.max(0, round2(Number(input.packingCharge ?? 0)));

  // Reprice on the server first so credit limit is verified before any writes.
  const priced = await recomputeFirstParty(
    admin,
    input.outletId,
    Array.isArray(input.pricingItems) ? input.pricingItems : [],
    packing,
    0,
    0,
    null,
  );
  if (!priced.ok) return { ok: false, error: priced.error };

  const grossItemsTotal = round2(
    priced.totals.items.reduce((s, it) => s + Number(it.total_price || 0), 0),
  );
  const pct = Math.min(100, Math.max(0, Number(input.discountPct ?? 0) || 0));
  const rawDisc =
    pct > 0
      ? (grossItemsTotal * pct) / 100
      : Math.max(0, Number(input.discountFlat ?? 0) || 0);
  const discount = Math.min(grossItemsTotal, round2(rawDisc));
  const netBeforeRound = Math.max(0, grossItemsTotal + packing - discount);
  const totalAmount = Math.round(netBeforeRound);
  const rounding = round2(totalAmount - netBeforeRound);

  if (!canOverrideLimit) {
    const check = checkTabCreditLimit(curBalance, creditLimit, totalAmount);
    if (!check.withinLimit) {
      return {
        ok: false,
        error: `Exceeds ${custTab.customer_name}'s Khata limit by ₹${check.overBy.toFixed(0)}. Manager approval or settlement required.`,
      };
    }
  }

  const note = cleanNote(input.note, ORDER_NOTE_MAX);
  let orderId: string;
  let chargedTotal = totalAmount;

  if (input.hasRunningOrder && input.posTabId && isUuid(input.posTabId)) {
    const loaded = await loadTab(db, input.posTabId, restaurant.id);
    if (!loaded.ok) return loaded;

    const kot = await sendKotForTab(
      loaded.tab,
      Array.isArray(input.lines) ? input.lines : [],
      custTab.customer_name,
    );
    if (!kot.ok) return kot;

    const runningOrderId = kot.orderId ?? loaded.tab.order_id;
    if (!runningOrderId) {
      return { ok: false, error: "This table has nothing to bill." };
    }

    const { data: orderItems } = await admin
      .from("order_items")
      .select("total_price")
      .eq("order_id", runningOrderId);
    const actualGross = round2(
      (orderItems ?? []).reduce((s, it) => s + Number(it.total_price || 0), 0),
    );
    const actualDisc = Math.min(
      actualGross,
      round2(
        pct > 0
          ? (actualGross * pct) / 100
          : Math.max(0, Number(input.discountFlat ?? 0) || 0),
      ),
    );
    const actualNet = Math.max(0, actualGross - actualDisc);
    chargedTotal = Math.round(actualNet);
    const actualRounding = round2(chargedTotal - actualNet);

    const tableShort = loaded.tab.name.split("·")[0].trim();
    const { error: updOrderErr } = await admin
      .from("orders")
      .update({
        table_id: loaded.tab.id,
        discount_amount: actualDisc,
        rounding_amount: actualRounding,
        total_amount: chargedTotal,
        customer_name: `${tableShort} · ${custTab.customer_name}`,
        customer_email: "pos+tab@billjot.local",
        customer_phone: custTab.phone,
        payment_status: "pending",
        payment_provider: "customer_tab",
        ...(note ? { instructions: note } : {}),
      })
      .eq("id", runningOrderId);

    if (updOrderErr) return { ok: false, error: updOrderErr.message };

    await db
      .from("pos_tabs")
      .update({ lines: [], order_id: null, updated_at: new Date().toISOString() })
      .eq("id", loaded.tab.id);

    orderId = runningOrderId;
    void dispatchOrderStatusWebhooks(orderId, "order.updated");
  } else {
    const resolvedOrderType = isOrderType(input.orderType)
      ? input.orderType
      : "dine-in";
    const resolvedTableId =
      resolvedOrderType === "dine-in" &&
      input.posTabId &&
      isUuid(input.posTabId)
        ? input.posTabId
        : null;
    const tokenNumber = randomInt(101, 999);
    const customerLabel =
      input.customerName?.trim() || custTab.customer_name;

    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        outlet_id: input.outletId,
        table_id: resolvedTableId,
        source: "pos",
        customer_name: customerLabel,
        customer_email: "pos+tab@billjot.local",
        customer_phone: custTab.phone,
        order_type: resolvedOrderType,
        subtotal: priced.totals.subtotal,
        cgst_amount: priced.totals.cgst,
        sgst_amount: priced.totals.sgst,
        gst_paid_by_operator: false,
        takeaway_charges: packing,
        discount_amount: discount,
        rounding_amount: rounding,
        total_amount: chargedTotal,
        token_number: tokenNumber,
        status: "pending",
        payment_status: "pending",
        payment_provider: "customer_tab",
        unique_order_id: newOrderNumber(),
        ...(note ? { instructions: note } : {}),
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      return { ok: false, error: orderErr?.message ?? "Failed to create POS bill." };
    }

    const anyItemNote = priced.totals.items.some((it) => it.instructions);
    const { data: insertedItems, error: itemsErr } = await admin
      .from("order_items")
      .insert(
        priced.totals.items.map((it) => ({
          order_id: order.id,
          product_config: it.product_config as Json,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total_price: it.total_price,
          ...(anyItemNote ? { instructions: it.instructions } : {}),
        })),
      )
      .select("id, quantity, instructions");

    if (itemsErr) {
      await admin.from("orders").delete().eq("id", order.id);
      return { ok: false, error: itemsErr.message };
    }

    if (insertedItems && insertedItems.length > 0) {
      const { data: ticket } = await admin
        .from("kot_tickets")
        .insert({
          outlet_id: input.outletId,
          order_id: order.id,
          ticket_number: tokenNumber,
          status: "printed",
          notes: note,
          printed_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (ticket) {
        await admin.from("kot_ticket_items").insert(
          insertedItems.map((oi) => ({
            kot_ticket_id: ticket.id,
            order_item_id: oi.id,
            quantity: oi.quantity,
            notes: oi.instructions,
          })),
        );
      }
    }

    orderId = order.id;
    void dispatchOrderStatusWebhooks(orderId, "order.created");
  }

  const nextBalance = computeTabNextBalance(curBalance, "charge", chargedTotal);
  const { error: txErr } = await admin.from("customer_tab_transactions").insert({
    restaurant_id: restaurant.id,
    tab_id: custTab.id,
    order_id: orderId,
    entry_type: "charge",
    amount: chargedTotal,
    balance_after: nextBalance,
    note: `POS Bill (${input.orderType})`,
  });
  if (txErr) {
    return { ok: false, error: txErr.message };
  }

  await admin
    .from("customer_tabs")
    .update({ current_balance: nextBalance })
    .eq("id", custTab.id)
    .eq("restaurant_id", restaurant.id);

  revalidateFloorAndKitchen(slug);
  revalidatePath(`/r/${slug}/pos`);
  revalidatePath(`/r/${slug}/admin/accounts`);
  revalidatePath(`/r/${slug}/admin/register`);
  return { ok: true, orderId, nextBalance };
}
