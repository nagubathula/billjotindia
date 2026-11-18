"use server";

import { revalidatePath } from "next/cache";
import {
  checkTabCreditLimit,
  computeCorporateInvoiceTotals,
  computeDueDate,
  computeInvoicePaymentStatus,
  computeTabNextBalance,
  EXPENSE_CATEGORIES,
  inferStateCodeFromGstin,
  type CorporateInvoiceLineInput,
  type ExpenseCategory,
  type TabEntryType,
  type TabPaymentMode,
} from "@/lib/accounts";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CorporateClient,
  CorporateInvoice,
  CustomerTab,
  CustomerTabTransaction,
  OutletExpense,
} from "@/lib/types";
import { isUuid } from "@/lib/utils";
import { isValidGstin } from "@/lib/vendors";

const VALID_EXPENSE_CATEGORIES = new Set<string>(
  EXPENSE_CATEGORIES.map((c) => c.value),
);
const VALID_PAYMENT_MODES = new Set<TabPaymentMode>([
  "cash",
  "upi",
  "card",
  "bank_transfer",
]);
const VALID_CORPORATE_TERMS = new Set([
  "due_on_receipt",
  "net_7",
  "net_15",
  "net_30",
]);

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

async function authorizeOps(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  await requireRole(["admin", "manager"], {
    restaurantId: restaurant.id,
  });
  return restaurant;
}

function revalidateAccountsPaths(slug: string) {
  revalidatePath(`/r/${slug}/admin/accounts`);
  revalidatePath(`/r/${slug}/admin/register`);
  revalidatePath(`/r/${slug}/pos`);
}

// ===========================================================================
// 1. PEOPLE'S TABS (KHATA)
// ===========================================================================

export async function saveCustomerTabAction(
  slug: string,
  input: {
    id?: string;
    outlet_id?: string | null;
    customer_name: string;
    phone?: string;
    email?: string;
    company_or_notes?: string;
    credit_limit: number;
    status?: "active" | "suspended" | "closed";
  },
): Promise<{ ok: true; tab: CustomerTab } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };

  const name = String(input.customer_name ?? "").trim();
  if (name.length < 2) {
    return { ok: false, error: "Customer name must be at least 2 characters." };
  }

  const creditLimit = Math.max(0, round2(Number(input.credit_limit) || 0));
  const status =
    input.status === "suspended" || input.status === "closed"
      ? input.status
      : "active";

  const admin = createAdminClient();
  let outletId: string | null = null;
  if (input.outlet_id && isUuid(input.outlet_id)) {
    const { data: outlet } = await admin
      .from("outlets")
      .select("id")
      .eq("id", input.outlet_id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (outlet) outletId = outlet.id;
  }

  const phone = String(input.phone ?? "").trim().slice(0, 30) || null;
  const email = String(input.email ?? "").trim().slice(0, 120) || null;
  const companyOrNotes =
    String(input.company_or_notes ?? "").trim().slice(0, 240) || null;

  if (input.id && isUuid(input.id)) {
    const { data, error } = await admin
      .from("customer_tabs")
      .update({
        outlet_id: outletId,
        customer_name: name.slice(0, 120),
        phone,
        email,
        company_or_notes: companyOrNotes,
        credit_limit: creditLimit,
        status,
      })
      .eq("id", input.id)
      .eq("restaurant_id", restaurant.id)
      .select("*")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "Failed to update tab." };
    }
    revalidateAccountsPaths(slug);
    return { ok: true, tab: data as CustomerTab };
  }

  const { data, error } = await admin
    .from("customer_tabs")
    .insert({
      restaurant_id: restaurant.id,
      outlet_id: outletId,
      customer_name: name.slice(0, 120),
      phone,
      email,
      company_or_notes: companyOrNotes,
      credit_limit: creditLimit,
      current_balance: 0,
      status,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create tab." };
  }

  revalidateAccountsPaths(slug);
  return { ok: true, tab: data as CustomerTab };
}

export async function recordTabTransactionAction(
  slug: string,
  input: {
    tab_id: string;
    entry_type: TabEntryType;
    amount: number;
    payment_mode?: TabPaymentMode | null;
    reference_no?: string;
    note?: string;
    allow_over_limit?: boolean;
  },
): Promise<
  | { ok: true; tab: CustomerTab; transaction: CustomerTabTransaction }
  | { ok: false; error: string }
> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.tab_id)) return { ok: false, error: "Invalid tab ID." };

  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }

  const entryType: TabEntryType =
    input.entry_type === "payment" || input.entry_type === "credit_note"
      ? input.entry_type
      : "charge";

  const paymentMode =
    entryType === "payment" &&
    input.payment_mode &&
    VALID_PAYMENT_MODES.has(input.payment_mode)
      ? input.payment_mode
      : null;

  if (entryType === "payment" && !paymentMode) {
    return { ok: false, error: "Select a settlement payment mode." };
  }

  const admin = createAdminClient();
  const { data: tabRow } = await admin
    .from("customer_tabs")
    .select("*")
    .eq("id", input.tab_id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!tabRow) return { ok: false, error: "Customer tab not found." };
  if (entryType === "charge" && tabRow.status !== "active") {
    return {
      ok: false,
      error: "Suspended or closed tabs cannot accept new charges.",
    };
  }

  const curBalance = Number(tabRow.current_balance ?? 0);
  const creditLimit = Number(tabRow.credit_limit ?? 0);

  if (entryType === "charge" && !input.allow_over_limit) {
    const check = checkTabCreditLimit(curBalance, creditLimit, amount);
    if (!check.withinLimit) {
      return {
        ok: false,
        error: `Charge exceeds credit limit by ₹${check.overBy.toFixed(0)}. Enable over-limit override or collect a payment first.`,
      };
    }
  }

  const nextBalance = computeTabNextBalance(curBalance, entryType, amount);

  const { data: tx, error: txErr } = await admin
    .from("customer_tab_transactions")
    .insert({
      restaurant_id: restaurant.id,
      tab_id: tabRow.id,
      entry_type: entryType,
      amount,
      balance_after: nextBalance,
      payment_mode: paymentMode,
      reference_no: String(input.reference_no ?? "").trim().slice(0, 80) || null,
      note: String(input.note ?? "").trim().slice(0, 240) || null,
    })
    .select("*")
    .single();

  if (txErr || !tx) {
    return { ok: false, error: txErr?.message ?? "Failed to record entry." };
  }

  const { data: updatedTab, error: updErr } = await admin
    .from("customer_tabs")
    .update({ current_balance: nextBalance })
    .eq("id", tabRow.id)
    .eq("restaurant_id", restaurant.id)
    .select("*")
    .single();

  if (updErr || !updatedTab) {
    return { ok: false, error: updErr?.message ?? "Failed to update tab balance." };
  }

  revalidateAccountsPaths(slug);
  return {
    ok: true,
    tab: updatedTab as CustomerTab,
    transaction: tx as CustomerTabTransaction,
  };
}

export async function setCustomerTabStatusAction(
  slug: string,
  tabId: string,
  status: "active" | "suspended" | "closed",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(tabId)) return { ok: false, error: "Invalid tab ID." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("customer_tabs")
    .update({ status })
    .eq("id", tabId)
    .eq("restaurant_id", restaurant.id);

  if (error) return { ok: false, error: error.message };
  revalidateAccountsPaths(slug);
  return { ok: true };
}

// ===========================================================================
// 2. CORPORATE CLIENTS & B2B GST INVOICES
// ===========================================================================

export async function saveCorporateClientAction(
  slug: string,
  input: {
    id?: string;
    company_name: string;
    gstin?: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    billing_address?: string;
    state_name?: string;
    state_code?: string;
    payment_terms?: string;
    credit_limit?: number;
    status?: "active" | "inactive";
    notes?: string;
  },
): Promise<
  { ok: true; client: CorporateClient } | { ok: false; error: string }
> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };

  const companyName = String(input.company_name ?? "").trim();
  if (companyName.length < 2) {
    return { ok: false, error: "Company name is required." };
  }

  const gstin = String(input.gstin ?? "").trim().toUpperCase();
  if (!isValidGstin(gstin)) {
    return {
      ok: false,
      error: "Invalid GSTIN format. Must be 15 alphanumeric characters (e.g. 36AABCU9603R1ZM).",
    };
  }

  const stateCode =
    String(input.state_code ?? "").trim() ||
    inferStateCodeFromGstin(gstin) ||
    "36";
  const paymentTerms = VALID_CORPORATE_TERMS.has(input.payment_terms ?? "")
    ? String(input.payment_terms)
    : "net_15";
  const creditLimit = Math.max(0, round2(Number(input.credit_limit ?? 50000) || 0));
  const status = input.status === "inactive" ? "inactive" : "active";

  const admin = createAdminClient();
  if (input.id && isUuid(input.id)) {
    const { data, error } = await admin
      .from("corporate_clients")
      .update({
        company_name: companyName.slice(0, 140),
        gstin: gstin || null,
        contact_person: String(input.contact_person ?? "").trim().slice(0, 100) || null,
        email: String(input.email ?? "").trim().slice(0, 120) || null,
        phone: String(input.phone ?? "").trim().slice(0, 30) || null,
        billing_address: String(input.billing_address ?? "").trim().slice(0, 260) || null,
        state_name: String(input.state_name ?? "").trim().slice(0, 60) || null,
        state_code: stateCode.slice(0, 4),
        payment_terms: paymentTerms,
        credit_limit: creditLimit,
        status,
        notes: String(input.notes ?? "").trim().slice(0, 300) || null,
      })
      .eq("id", input.id)
      .eq("restaurant_id", restaurant.id)
      .select("*")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Failed to update client." };
    }
    revalidateAccountsPaths(slug);
    return { ok: true, client: data as CorporateClient };
  }

  const { data, error } = await admin
    .from("corporate_clients")
    .insert({
      restaurant_id: restaurant.id,
      company_name: companyName.slice(0, 140),
      gstin: gstin || null,
      contact_person: String(input.contact_person ?? "").trim().slice(0, 100) || null,
      email: String(input.email ?? "").trim().slice(0, 120) || null,
      phone: String(input.phone ?? "").trim().slice(0, 30) || null,
      billing_address: String(input.billing_address ?? "").trim().slice(0, 260) || null,
      state_name: String(input.state_name ?? "Telangana").trim().slice(0, 60) || "Telangana",
      state_code: stateCode.slice(0, 4),
      payment_terms: paymentTerms,
      credit_limit: creditLimit,
      status,
      notes: String(input.notes ?? "").trim().slice(0, 300) || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to add corporate client." };
  }

  revalidateAccountsPaths(slug);
  return { ok: true, client: data as CorporateClient };
}

export async function createCorporateInvoiceAction(
  slug: string,
  input: {
    corporate_client_id: string;
    outlet_id?: string | null;
    invoice_number?: string;
    invoice_date: string;
    due_date?: string;
    po_reference?: string;
    place_of_supply?: string;
    supply_type: "intra" | "inter";
    items: CorporateInvoiceLineInput[];
    linked_order_ids?: string[];
    notes?: string;
  },
): Promise<
  { ok: true; invoice: CorporateInvoice } | { ok: false; error: string }
> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.corporate_client_id)) {
    return { ok: false, error: "Select a valid corporate client." };
  }

  const admin = createAdminClient();
  const { data: client } = await admin
    .from("corporate_clients")
    .select("*")
    .eq("id", input.corporate_client_id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!client) {
    return { ok: false, error: "Corporate client not found." };
  }

  let outletId: string | null = null;
  if (input.outlet_id && isUuid(input.outlet_id)) {
    const { data: outlet } = await admin
      .from("outlets")
      .select("id")
      .eq("id", input.outlet_id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (outlet) outletId = outlet.id;
  }

  const linkedIds = Array.isArray(input.linked_order_ids)
    ? input.linked_order_ids.filter(isUuid)
    : [];

  let combinedInputs: CorporateInvoiceLineInput[] = Array.isArray(input.items)
    ? input.items
    : [];

  if (linkedIds.length > 0 && combinedInputs.length === 0) {
    const { data: outletsForRest } = await admin
      .from("outlets")
      .select("id")
      .eq("restaurant_id", restaurant.id);
    const allowedOutlets = new Set((outletsForRest ?? []).map((o) => o.id));
    const { data: linkedOrders } = await admin
      .from("orders")
      .select("id, outlet_id, unique_order_id, subtotal, placed_at, order_type")
      .in("id", linkedIds);

    combinedInputs = (linkedOrders ?? [])
      .filter((o) => allowedOutlets.has(o.outlet_id))
      .map((o) => ({
        description: `Order #${o.unique_order_id ?? o.id.slice(0, 8)} (${o.order_type ?? "dining"})`,
        hsn_sac: "996331",
        qty: 1,
        unit_price: round2(Number(o.subtotal ?? 0)),
        gst_rate: 5,
      }));
  }

  const supplyType = input.supply_type === "inter" ? "inter" : "intra";
  const computed = computeCorporateInvoiceTotals(combinedInputs, supplyType);
  if (computed.lines.length === 0) {
    return { ok: false, error: "Add at least one invoice line item." };
  }

  const invoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(input.invoice_date)
    ? input.invoice_date
    : new Date().toISOString().slice(0, 10);
  const dueDate =
    input.due_date && /^\d{4}-\d{2}-\d{2}$/.test(input.due_date)
      ? input.due_date
      : computeDueDate(invoiceDate, client.payment_terms);

  const invoiceNumber =
    String(input.invoice_number ?? "")
      .trim()
      .toUpperCase() ||
    `INV-${invoiceDate.replaceAll("-", "").slice(0, 6)}-${String(
      Math.floor(100 + Math.random() * 900),
    )}`;

  const { data, error } = await admin
    .from("corporate_invoices")
    .insert({
      restaurant_id: restaurant.id,
      outlet_id: outletId,
      corporate_client_id: client.id,
      invoice_number: invoiceNumber.slice(0, 40),
      invoice_date: invoiceDate,
      due_date: dueDate,
      po_reference: String(input.po_reference ?? "").trim().slice(0, 60) || null,
      place_of_supply:
        String(input.place_of_supply ?? "").trim().slice(0, 80) ||
        `${client.state_code ?? "36"} - ${client.state_name ?? "Telangana"}`,
      supply_type: supplyType,
      line_items: computed.lines as unknown as Json,
      linked_order_ids: linkedIds,
      taxable_subtotal: computed.taxableSubtotal,
      cgst_amount: computed.cgstAmount,
      sgst_amount: computed.sgstAmount,
      igst_amount: computed.igstAmount,
      total_amount: computed.totalAmount,
      amount_paid: 0,
      payment_status: "unpaid",
      status: "issued",
      notes: String(input.notes ?? "").trim().slice(0, 400) || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        ok: false,
        error: `Invoice number "${invoiceNumber}" already exists.`,
      };
    }
    return { ok: false, error: error?.message ?? "Failed to create invoice." };
  }

  revalidateAccountsPaths(slug);
  return { ok: true, invoice: data as CorporateInvoice };
}

export async function recordCorporateInvoicePaymentAction(
  slug: string,
  input: {
    invoice_id: string;
    amount: number;
  },
): Promise<
  { ok: true; invoice: CorporateInvoice } | { ok: false; error: string }
> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.invoice_id)) {
    return { ok: false, error: "Invalid invoice ID." };
  }

  const addPaid = round2(Number(input.amount));
  if (!Number.isFinite(addPaid) || addPaid <= 0) {
    return { ok: false, error: "Payment amount must be greater than zero." };
  }

  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("corporate_invoices")
    .select("*")
    .eq("id", input.invoice_id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status === "cancelled") {
    return { ok: false, error: "Cannot record payment against a cancelled invoice." };
  }

  const total = Number(inv.total_amount ?? 0);
  const currentPaid = Number(inv.amount_paid ?? 0);
  const remaining = Math.max(0, round2(total - currentPaid));
  if (addPaid > remaining + 1) {
    return {
      ok: false,
      error: `Payment exceeds remaining balance (₹${remaining.toFixed(2)}).`,
    };
  }

  const nextPaid = Math.min(total, round2(currentPaid + addPaid));
  const nextStatus = computeInvoicePaymentStatus(total, nextPaid);

  const { data: updated, error } = await admin
    .from("corporate_invoices")
    .update({
      amount_paid: nextPaid,
      payment_status: nextStatus,
    })
    .eq("id", inv.id)
    .eq("restaurant_id", restaurant.id)
    .select("*")
    .single();

  if (error || !updated) {
    return { ok: false, error: error?.message ?? "Failed to record payment." };
  }

  revalidateAccountsPaths(slug);
  return { ok: true, invoice: updated as CorporateInvoice };
}

export async function cancelCorporateInvoiceAction(
  slug: string,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(invoiceId)) return { ok: false, error: "Invalid invoice ID." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("corporate_invoices")
    .update({ status: "cancelled" })
    .eq("id", invoiceId)
    .eq("restaurant_id", restaurant.id);

  if (error) return { ok: false, error: error.message };
  revalidateAccountsPaths(slug);
  return { ok: true };
}

// ===========================================================================
// 3. PETTY CASH & OUTLET EXPENSES
// ===========================================================================

export async function createOutletExpenseAction(
  slug: string,
  input: {
    outlet_id?: string | null;
    expense_date: string;
    category: string;
    title: string;
    amount: number;
    payment_mode?: string;
    paid_to?: string;
    note?: string;
  },
): Promise<{ ok: true; expense: OutletExpense } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };

  const title = String(input.title ?? "").trim();
  if (title.length < 2) {
    return { ok: false, error: "Enter a brief expense description." };
  }
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }

  const category: ExpenseCategory = VALID_EXPENSE_CATEGORIES.has(input.category)
    ? (input.category as ExpenseCategory)
    : "misc";
  const paymentMode = VALID_PAYMENT_MODES.has(input.payment_mode as TabPaymentMode)
    ? (input.payment_mode as TabPaymentMode)
    : "cash";
  const expenseDate = /^\d{4}-\d{2}-\d{2}$/.test(input.expense_date)
    ? input.expense_date
    : new Date().toISOString().slice(0, 10);

  const admin = createAdminClient();
  let outletId: string | null = null;
  if (input.outlet_id && isUuid(input.outlet_id)) {
    const { data: outlet } = await admin
      .from("outlets")
      .select("id")
      .eq("id", input.outlet_id)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();
    if (outlet) outletId = outlet.id;
  }

  const { data, error } = await admin
    .from("outlet_expenses")
    .insert({
      restaurant_id: restaurant.id,
      outlet_id: outletId,
      expense_date: expenseDate,
      category,
      title: title.slice(0, 160),
      amount,
      payment_mode: paymentMode,
      paid_to: String(input.paid_to ?? "").trim().slice(0, 100) || null,
      note: String(input.note ?? "").trim().slice(0, 240) || null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to record expense." };
  }

  revalidateAccountsPaths(slug);
  return { ok: true, expense: data as OutletExpense };
}

export async function deleteOutletExpenseAction(
  slug: string,
  expenseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(expenseId)) return { ok: false, error: "Invalid expense ID." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("outlet_expenses")
    .delete()
    .eq("id", expenseId)
    .eq("restaurant_id", restaurant.id);

  if (error) return { ok: false, error: error.message };
  revalidateAccountsPaths(slug);
  return { ok: true };
}
