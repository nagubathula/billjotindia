import "server-only";
import { randomInt } from "node:crypto";
import { buildModifierConfigKey } from "@/lib/customizations";
import { dispatchOrderStatusWebhooks } from "@/lib/order-webhooks";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ORDER_NOTE_MAX,
  cleanNote,
  newOrderNumber,
  recomputeFirstParty,
  round2,
  splitGst,
  type OrderItemInput,
} from "@/lib/order-pricing";
import type { Json } from "@/lib/database.types";

// Running table orders. A table's tab (pos_tabs) collects lines in the POS.
// "Send KOT" turns the lines not yet sent into a kitchen order: the first KOT
// creates one unpaid order for the table, later KOTs add items to it. When the
// cashier settles the table, that same order gets the discount, rounding and
// payment mode, and the tab is cleared.
//
// An order stays marked RUNNING_ORDER_EMAIL until it's settled; afterwards it
// carries pos+<mode>@billjot.local like every other POS bill, which is what
// receipts, Day-End and Reports read the payment mode from.

export const RUNNING_ORDER_EMAIL = "pos+open@billjot.local";

export const VOID_ITEM_REASONS = [
  { code: "customer_changed_mind", label: "Customer changed mind" },
  { code: "wrong_item_punched", label: "Wrong item punched" },
  { code: "out_of_stock", label: "Item out of stock" },
  { code: "kitchen_delay", label: "Kitchen delay" },
  { code: "quality_issue", label: "Quality / remake" },
  { code: "other", label: "Other reason" },
] as const;

export type VoidItemReasonCode = (typeof VOID_ITEM_REASONS)[number]["code"];

/** The subset of the POS's cart line this code relies on. */
export type PosLine = {
  configKey?: string;
  product?: { id?: string; name?: string };
  qty?: number;
  unitPrice?: number;
  selectedOptions?: unknown;
  instructions?: string;
  /** How many of qty have already gone to the kitchen. */
  sentQty?: number;
  [key: string]: unknown;
};

export type TabRow = {
  id: string;
  outlet_id: string;
  name: string;
  order_id: string | null;
};

export type SendKotResult =
  | {
      ok: true;
      orderId: string | null;
      tokenNumber: number | null;
      sentItems: number;
      lines: PosLine[];
    }
  | { ok: false; error: string };

const whole = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));
const unsent = (l: PosLine) => Math.max(0, whole(l.qty) - whole(l.sentQty));

/** "T-04 · Ground Main Hall · 4p" → "T-04"; the tables board matches on it. */
export function tableCode(tabName: string) {
  return tabName.split("·")[0].trim() || "Table";
}

/** Matches PosBilling.tsx's `buildConfigKey(productId, selectedOptions)`. */
export function buildLineConfigKey(
  productId: string,
  selectedOptions: unknown,
): string {
  return buildModifierConfigKey(productId, selectedOptions);
}

export function configKeyForPosLine(line: PosLine): string {
  if (typeof line.configKey === "string" && line.configKey) return line.configKey;
  return buildLineConfigKey(line.product?.id ?? "", line.selectedOptions);
}

type OpenOrder = {
  id: string;
  token_number: number | null;
  status: string | null;
  subtotal: number;
  cgst_amount: number | null;
  sgst_amount: number | null;
  total_amount: number;
  customer_name: string;
  customer_email: string | null;
  voided_items: Json | null;
};

const ORDER_COLUMNS =
  "id, token_number, status, subtotal, cgst_amount, sgst_amount, total_amount, customer_name, customer_email, voided_items";

async function openOrderFor(
  db: ReturnType<typeof createAdminClient>,
  orderId: string | null,
): Promise<OpenOrder | null> {
  if (!orderId) return null;
  const { data } = await db
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();
  if (!data) return null;
  if (data.customer_email !== RUNNING_ORDER_EMAIL) return null; // already settled
  if (data.status === "cancelled" || data.status === "completed") return null;
  return data as OpenOrder;
}

async function recomputeOrderTotalsFromRemainingItems(
  db: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<{
  count: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  total_amount: number;
}> {
  const { data: rows } = await db
    .from("order_items")
    .select("quantity, unit_price, total_price, product_config")
    .eq("order_id", orderId);

  let gross = 0;
  let gst = 0;
  const list = rows ?? [];
  for (const r of list) {
    const lineTotal = Number(r.total_price ?? 0);
    const cfg =
      r.product_config &&
      typeof r.product_config === "object" &&
      !Array.isArray(r.product_config)
        ? (r.product_config as { gst_rate?: unknown })
        : {};
    const rate = Number(cfg.gst_rate ?? 5);
    gross += lineTotal;
    gst += splitGst(lineTotal, rate);
  }

  return {
    count: list.length,
    subtotal: round2(gross - gst),
    cgst: round2(gst / 2),
    sgst: round2(gst / 2),
    total_amount: round2(gross),
  };
}

/**
 * Sends the tab's unsent lines to the kitchen and links the tab to its
 * running order. Lines are priced from the menu exactly like the order API.
 */
export async function sendKotForTab(
  tab: TabRow,
  lines: PosLine[],
  customerName?: string,
): Promise<SendKotResult> {
  const db = createAdminClient();

  const pending = lines
    .map((line) => ({ line, qty: unsent(line) }))
    .filter((p) => p.qty > 0 && typeof p.line.product?.id === "string");
  if (pending.length === 0) {
    return { ok: true, orderId: tab.order_id, tokenNumber: null, sentItems: 0, lines };
  }

  const items: OrderItemInput[] = pending.map(({ line, qty }) => ({
    quantity: qty,
    unit_price: 0,
    total_price: 0,
    instructions: typeof line.instructions === "string" ? line.instructions : undefined,
    product_config: {
      product_id: line.product!.id,
      name: line.product!.name,
      selected_options: Array.isArray(line.selectedOptions) ? line.selectedOptions : [],
    } as Json,
  }));
  const priced = await recomputeFirstParty(db, tab.outlet_id, items, 0, 0, 0, null);
  if (!priced.ok) return { ok: false, error: priced.error };
  const t = priced.totals;

  let order = await openOrderFor(db, tab.order_id);
  let created = false;
  if (!order) {
    const code = tableCode(tab.name);
    const name = customerName?.trim();
    const { data, error } = await db
      .from("orders")
      .insert({
        outlet_id: tab.outlet_id,
        table_id: tab.id,
        source: "pos",
        customer_name: name ? `${code} · ${name}` : code,
        customer_email: RUNNING_ORDER_EMAIL,
        order_type: "dine-in",
        subtotal: t.subtotal,
        cgst_amount: t.cgst,
        sgst_amount: t.sgst,
        gst_paid_by_operator: false,
        takeaway_charges: 0,
        discount_amount: 0,
        rounding_amount: 0,
        total_amount: t.total_amount,
        token_number: randomInt(101, 999),
        status: "pending",
        unique_order_id: newOrderNumber(),
      })
      .select(ORDER_COLUMNS)
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Couldn't create the kitchen order" };
    }
    order = data as OpenOrder;
    created = true;
  }

  // Items first, so a failure leaves the order's totals untouched.
  const anyNote = t.items.some((it) => it.instructions);
  const { data: inserted, error: itemsErr } = await db
    .from("order_items")
    .insert(
      t.items.map((it) => ({
        order_id: order!.id,
        product_config: it.product_config,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.total_price,
        ...(anyNote ? { instructions: it.instructions } : {}),
      })),
    )
    .select("id, quantity, instructions");
  if (itemsErr || !inserted) {
    if (created) await db.from("orders").delete().eq("id", order.id);
    return { ok: false, error: itemsErr?.message ?? "Couldn't send the items" };
  }

  if (!created) {
    const { error: totalsErr } = await db
      .from("orders")
      .update({
        table_id: tab.id,
        subtotal: round2(Number(order.subtotal) + t.subtotal),
        cgst_amount: round2(Number(order.cgst_amount ?? 0) + t.cgst),
        sgst_amount: round2(Number(order.sgst_amount ?? 0) + t.sgst),
        total_amount: round2(Number(order.total_amount) + t.total_amount),
        // New items need cooking: a finished order goes back to the kitchen.
        ...(order.status === "ready" ? { status: "preparing" } : {}),
      })
      .eq("id", order.id);
    if (totalsErr) {
      await db.from("order_items").delete().in("id", inserted.map((i) => i.id));
      return { ok: false, error: totalsErr.message };
    }
  }

  // A kitchen ticket for this round, like the order API makes for each order.
  const { data: ticket } = await db
    .from("kot_tickets")
    .insert({
      outlet_id: tab.outlet_id,
      order_id: order.id,
      ticket_number: order.token_number,
      status: "printed",
      printed_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (ticket) {
    await db.from("kot_ticket_items").insert(
      inserted.map((oi) => ({
        kot_ticket_id: ticket.id,
        order_item_id: oi.id,
        quantity: oi.quantity,
        notes: oi.instructions,
      })),
    );
  }

  const sentLines = lines.map((l) => ({ ...l, sentQty: whole(l.qty) }));
  await db
    .from("pos_tabs")
    .update({
      lines: sentLines as unknown as Json,
      order_id: order.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tab.id);

  return {
    ok: true,
    orderId: order.id,
    tokenNumber: order.token_number,
    sentItems: pending.reduce((s, p) => s + p.qty, 0),
    lines: sentLines,
  };
}

/**
 * Voids `quantity` of a previously sent line from a running table order
 * (Manager / Admin only, enforced by caller). Updates `order_items`,
 * `kot_ticket_items`, `orders.voided_items`, `orders` totals, and `pos_tabs`.
 */
export async function voidSentItemForTab(
  tab: TabRow,
  input: {
    configKey: string;
    quantity: number;
    reason: string;
    note?: string;
    voidedBy: string;
    currentLines: PosLine[];
  },
): Promise<
  | { ok: true; lines: PosLine[]; orderId: string | null }
  | { ok: false; error: string }
> {
  const voidQty = whole(input.quantity);
  if (voidQty <= 0) {
    return { ok: false, error: "Choose at least 1 item to void." };
  }

  const validReasons = VOID_ITEM_REASONS.map((r) => r.code) as readonly string[];
  if (!validReasons.includes(input.reason)) {
    return { ok: false, error: "Select a valid reason to void this item." };
  }
  const cleanReasonNote = cleanNote(input.note, 240);
  if (input.reason === "other" && !cleanReasonNote) {
    return { ok: false, error: "Enter a brief note explaining the void reason." };
  }

  const db = createAdminClient();
  const order = await openOrderFor(db, tab.order_id);
  if (!order) {
    return { ok: false, error: "No active kitchen order found on this table." };
  }

  const { data: orderItems, error: itemsErr } = await db
    .from("order_items")
    .select("id, quantity, unit_price, total_price, product_config, created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false });
  if (itemsErr || !orderItems) {
    return { ok: false, error: itemsErr?.message ?? "Couldn't load kitchen items." };
  }

  const matchingRows = orderItems.filter((row) => {
    const cfg =
      row.product_config &&
      typeof row.product_config === "object" &&
      !Array.isArray(row.product_config)
        ? (row.product_config as {
            product_id?: string;
            selected_options?: unknown;
          })
        : {};
    if (!cfg.product_id) return false;
    return buildLineConfigKey(cfg.product_id, cfg.selected_options) === input.configKey;
  });

  const availableSent = matchingRows.reduce((s, r) => s + whole(r.quantity), 0);
  if (availableSent < voidQty) {
    return {
      ok: false,
      error: `Only ${availableSent} sent unit(s) of this item remain on the kitchen order.`,
    };
  }

  let remainingToVoid = voidQty;
  let sampleName = "Item";
  let sampleProductId: string | null = null;
  let sampleUnitPrice = 0;

  for (const row of matchingRows) {
    if (remainingToVoid <= 0) break;
    const cfg =
      row.product_config &&
      typeof row.product_config === "object" &&
      !Array.isArray(row.product_config)
        ? (row.product_config as { product_id?: string; name?: string })
        : {};
    sampleName = cfg.name ?? sampleName;
    sampleProductId = cfg.product_id ?? sampleProductId;
    sampleUnitPrice = Number(row.unit_price ?? 0);

    const rowQty = whole(row.quantity);
    const take = Math.min(rowQty, remainingToVoid);
    remainingToVoid -= take;

    if (take >= rowQty) {
      await db.from("order_items").delete().eq("id", row.id);
    } else {
      const nextRowQty = rowQty - take;
      const nextTotal = round2(Number(row.unit_price ?? 0) * nextRowQty);
      await db
        .from("order_items")
        .update({ quantity: nextRowQty, total_price: nextTotal })
        .eq("id", row.id);

      const { data: ticketItems } = await db
        .from("kot_ticket_items")
        .select("id, quantity")
        .eq("order_item_id", row.id)
        .order("created_at", { ascending: false });
      let ticketReduce = take;
      for (const ti of ticketItems ?? []) {
        if (ticketReduce <= 0) break;
        const tiQty = whole(ti.quantity);
        if (ticketReduce >= tiQty) {
          ticketReduce -= tiQty;
          await db.from("kot_ticket_items").delete().eq("id", ti.id);
        } else {
          await db
            .from("kot_ticket_items")
            .update({ quantity: tiQty - ticketReduce })
            .eq("id", ti.id);
          ticketReduce = 0;
        }
      }
    }
  }

  const prevVoided = Array.isArray(order.voided_items) ? order.voided_items : [];
  const nextVoided = [
    ...prevVoided,
    {
      product_id: sampleProductId,
      name: sampleName,
      quantity: voidQty,
      unit_price: sampleUnitPrice,
      reason: input.reason,
      note: cleanReasonNote,
      voided_by: input.voidedBy,
      voided_at: new Date().toISOString(),
    },
  ];

  const recomputed = await recomputeOrderTotalsFromRemainingItems(db, order.id);
  let nextOrderId: string | null = order.id;
  const nowIso = new Date().toISOString();

  if (recomputed.count === 0) {
    // All sent items on the order were voided -> cancel the running order cleanly
    await db
      .from("orders")
      .update({
        subtotal: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        total_amount: 0,
        status: "cancelled",
        cancel_reason: input.reason,
        cancel_note: cleanReasonNote ?? `All items voided (${input.reason})`,
        cancelled_by: "merchant",
        cancelled_at: nowIso,
        voided_items: nextVoided as unknown as Json,
      })
      .eq("id", order.id);
    nextOrderId = null;
  } else {
    await db
      .from("orders")
      .update({
        subtotal: recomputed.subtotal,
        cgst_amount: recomputed.cgst,
        sgst_amount: recomputed.sgst,
        total_amount: recomputed.total_amount,
        voided_items: nextVoided as unknown as Json,
      })
      .eq("id", order.id);
  }

  const updatedLines: PosLine[] = [];
  for (const line of input.currentLines) {
    if (configKeyForPosLine(line) !== input.configKey) {
      updatedLines.push(line);
      continue;
    }
    const curSent = whole(line.sentQty);
    const curQty = whole(line.qty);
    const nextSent = Math.max(0, curSent - voidQty);
    const nextQty = Math.max(nextSent, curQty - voidQty);
    if (nextQty > 0) {
      updatedLines.push({
        ...line,
        qty: nextQty,
        sentQty: nextOrderId ? nextSent : 0,
      });
    }
  }

  await db
    .from("pos_tabs")
    .update({
      lines: updatedLines as unknown as Json,
      order_id: nextOrderId,
      updated_at: nowIso,
    })
    .eq("id", tab.id);

  return { ok: true, lines: updatedLines, orderId: nextOrderId };
}

function mergePosLines(baseLines: PosLine[], incomingLines: PosLine[]): PosLine[] {
  const map = new Map<string, PosLine>();
  for (const l of baseLines) {
    const key = configKeyForPosLine(l);
    map.set(key, { ...l, configKey: key, qty: whole(l.qty), sentQty: whole(l.sentQty) });
  }
  for (const l of incomingLines) {
    const key = configKeyForPosLine(l);
    const existing = map.get(key);
    if (existing) {
      const mergedNote = [existing.instructions, l.instructions]
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .filter((v, idx, arr) => arr.indexOf(v) === idx)
        .join("; ");
      map.set(key, {
        ...existing,
        qty: whole(existing.qty) + whole(l.qty),
        sentQty: whole(existing.sentQty) + whole(l.sentQty),
        ...(mergedNote ? { instructions: mergedNote } : {}),
      });
    } else {
      map.set(key, { ...l, configKey: key, qty: whole(l.qty), sentQty: whole(l.sentQty) });
    }
  }
  return [...map.values()].filter((l) => whole(l.qty) > 0);
}

function rewriteTablePrefixInCustomerName(
  existingCustomerName: string,
  newCode: string,
): string {
  const parts = existingCustomerName
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${newCode} · ${parts.slice(1).join(" · ")}`;
  }
  return newCode;
}

/**
 * Moves (or merges) `source` table's cart + running kitchen order onto `target`
 * table atomically on the server.
 */
export async function moveTabOrder(
  source: TabRow & { lines: PosLine[] },
  target: TabRow & { lines: PosLine[] },
): Promise<
  | {
      ok: true;
      sourceCleared: boolean;
      targetLines: PosLine[];
      targetOrderId: string | null;
    }
  | { ok: false; error: string }
> {
  if (source.id === target.id) {
    return { ok: false, error: "Choose a different destination table." };
  }
  if (source.outlet_id !== target.outlet_id) {
    return { ok: false, error: "Tables belong to different outlets." };
  }

  const db = createAdminClient();
  const [sourceOrder, targetOrder] = await Promise.all([
    openOrderFor(db, source.order_id),
    openOrderFor(db, target.order_id),
  ]);

  const mergedLines = mergePosLines(target.lines, source.lines);
  const newCode = tableCode(target.name);
  const nowIso = new Date().toISOString();
  let finalTargetOrderId: string | null = targetOrder?.id ?? null;

  if (sourceOrder && !targetOrder) {
    // Move the running order directly to the destination table
    const nextCustomerName = rewriteTablePrefixInCustomerName(
      sourceOrder.customer_name,
      newCode,
    );
    const { error: moveErr } = await db
      .from("orders")
      .update({
        table_id: target.id,
        customer_name: nextCustomerName,
      })
      .eq("id", sourceOrder.id);
    if (moveErr) return { ok: false, error: moveErr.message };
    finalTargetOrderId = sourceOrder.id;
  } else if (sourceOrder && targetOrder) {
    // Merge two active running orders: move items & KOT tickets onto targetOrder
    const { error: reparentItemsErr } = await db
      .from("order_items")
      .update({ order_id: targetOrder.id })
      .eq("order_id", sourceOrder.id);
    if (reparentItemsErr) return { ok: false, error: reparentItemsErr.message };

    await db
      .from("kot_tickets")
      .update({ order_id: targetOrder.id })
      .eq("order_id", sourceOrder.id);

    const recomputed = await recomputeOrderTotalsFromRemainingItems(db, targetOrder.id);
    const mergedVoided = [
      ...(Array.isArray(targetOrder.voided_items) ? targetOrder.voided_items : []),
      ...(Array.isArray(sourceOrder.voided_items) ? sourceOrder.voided_items : []),
    ];
    const shouldReopen =
      targetOrder.status === "ready" &&
      (sourceOrder.status === "pending" ||
        sourceOrder.status === "confirmed" ||
        sourceOrder.status === "preparing");

    const { error: updateTargetOrderErr } = await db
      .from("orders")
      .update({
        table_id: target.id,
        subtotal: recomputed.subtotal,
        cgst_amount: recomputed.cgst,
        sgst_amount: recomputed.sgst,
        total_amount: recomputed.total_amount,
        voided_items: mergedVoided as unknown as Json,
        ...(shouldReopen ? { status: "preparing" } : {}),
      })
      .eq("id", targetOrder.id);
    if (updateTargetOrderErr) {
      return { ok: false, error: updateTargetOrderErr.message };
    }

    // Detach source tab before marking source order cancelled as merged
    await db
      .from("pos_tabs")
      .update({ lines: [], order_id: null, updated_at: nowIso })
      .eq("id", source.id);

    await db
      .from("orders")
      .update({
        table_id: null,
        subtotal: 0,
        cgst_amount: 0,
        sgst_amount: 0,
        total_amount: 0,
        status: "cancelled",
        cancel_reason: "merged_table",
        cancel_note: `Merged into ${newCode}`,
        cancelled_by: "merchant",
        cancelled_at: nowIso,
      })
      .eq("id", sourceOrder.id);

    finalTargetOrderId = targetOrder.id;
  }

  const { error: targetTabErr } = await db
    .from("pos_tabs")
    .update({
      lines: mergedLines as unknown as Json,
      order_id: finalTargetOrderId,
      updated_at: nowIso,
    })
    .eq("id", target.id);
  if (targetTabErr) return { ok: false, error: targetTabErr.message };

  await db
    .from("pos_tabs")
    .update({ lines: [], order_id: null, updated_at: nowIso })
    .eq("id", source.id);

  return {
    ok: true,
    sourceCleared: true,
    targetLines: mergedLines,
    targetOrderId: finalTargetOrderId,
  };
}

export type SettleInput = {
  mode: "cash" | "upi" | "card";
  lines: PosLine[];
  customerName?: string;
  note?: string;
  discountPct?: number;
  discountFlat?: number;
};

/**
 * Settles a table: sends anything still unsent, applies the discount and
 * rounding to the running order, records the payment mode, and clears the tab.
 */
export async function settleTab(
  tab: TabRow,
  input: SettleInput,
): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const kot = await sendKotForTab(tab, input.lines, input.customerName);
  if (!kot.ok) return kot;
  const orderId = kot.orderId ?? tab.order_id;
  if (!orderId) return { ok: false, error: "This table has nothing to bill." };

  const db = createAdminClient();
  const order = await openOrderFor(db, orderId);
  if (!order) return { ok: false, error: "This table's order is already settled or cancelled." };

  const { data: items, error: itemsErr } = await db
    .from("order_items")
    .select("total_price")
    .eq("order_id", orderId);
  if (itemsErr) return { ok: false, error: itemsErr.message };
  const gross = round2((items ?? []).reduce((s, it) => s + Number(it.total_price || 0), 0));

  const pct = Math.min(100, Math.max(0, Number(input.discountPct) || 0));
  const raw = pct > 0 ? (gross * pct) / 100 : Math.max(0, Number(input.discountFlat) || 0);
  const discount = Math.min(gross, round2(raw));
  const net = Math.max(0, gross - discount);
  const total = Math.round(net);
  const rounding = round2(total - net);

  const code = tableCode(tab.name);
  const name = input.customerName?.trim();
  const note = cleanNote(input.note, ORDER_NOTE_MAX);
  const { error } = await db
    .from("orders")
    .update({
      table_id: tab.id,
      discount_amount: discount,
      rounding_amount: rounding,
      total_amount: total,
      customer_email: `pos+${input.mode}@billjot.local`,
      ...(name ? { customer_name: `${code} · ${name}` } : {}),
      ...(note ? { instructions: note } : {}),
    })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  await db
    .from("pos_tabs")
    .update({ lines: [], order_id: null, updated_at: new Date().toISOString() })
    .eq("id", tab.id);

  void dispatchOrderStatusWebhooks(orderId, "order.updated");
  return { ok: true, orderId };
}
