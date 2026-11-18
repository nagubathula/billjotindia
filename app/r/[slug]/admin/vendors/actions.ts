"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { isValidIsoDate } from "@/lib/hr";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { isUuid } from "@/lib/utils";
import {
  computePurchaseOrderTotals,
  derivePoPaymentStatus,
  isValidGstin,
  VENDOR_CATEGORIES,
  VENDOR_PAYMENT_MODES,
  VENDOR_PAYMENT_TERMS,
  type PurchaseOrderItemInput,
  type VendorCategory,
  type VendorPaymentMode,
  type VendorPaymentTerms,
} from "@/lib/vendors";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

async function opsContext(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  const { user, role } = await requireRole(["admin", "manager"], {
    restaurantId: restaurant.id,
    redirectTo: `/r/${slug}/admin/vendors`,
  });
  return { restaurant, user, role };
}

async function adminOnlyContext(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  const { user } = await requireRole(["admin"], {
    restaurantId: restaurant.id,
    redirectTo: `/r/${slug}/admin/vendors`,
  });
  return { restaurant, user };
}

function isInEnum<T extends readonly { value: string }[]>(
  list: T,
  val: string,
): val is T[number]["value"] {
  return list.some((item) => item.value === val);
}

async function nextVendorCode(
  admin: ReturnType<typeof createAdminClient>,
  restaurantId: string,
): Promise<string> {
  const { data } = await admin
    .from("vendors")
    .select("vendor_code")
    .eq("restaurant_id", restaurantId);
  let maxNum = 0;
  for (const row of data ?? []) {
    const m = /^VND-(\d+)$/i.exec(row.vendor_code.trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  return `VND-${String(maxNum + 1).padStart(3, "0")}`;
}

async function nextPoNumber(
  admin: ReturnType<typeof createAdminClient>,
  restaurantId: string,
  orderDate: string,
): Promise<string> {
  const ym = orderDate.slice(0, 7).replace("-", "");
  const prefix = `PO-${ym}-`;
  const { data } = await admin
    .from("vendor_purchase_orders")
    .select("po_number")
    .eq("restaurant_id", restaurantId)
    .ilike("po_number", `${prefix}%`);
  let maxSeq = 0;
  for (const row of data ?? []) {
    const tail = row.po_number.slice(prefix.length);
    const n = Number(tail);
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function saveVendorAction(
  slug: string,
  input: {
    id?: string | null;
    vendorCode?: string | null;
    name: string;
    category: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    address?: string | null;
    paymentTerms: string;
    upiOrBank?: string | null;
    status: string;
    notes?: string | null;
  },
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };

  const name = input.name.trim();
  if (!name || name.length > 120) {
    return { ok: false, error: "Enter the supplier's business name." };
  }
  if (!isInEnum(VENDOR_CATEGORIES, input.category)) {
    return { ok: false, error: "Choose a valid supplier category." };
  }
  if (!isInEnum(VENDOR_PAYMENT_TERMS, input.paymentTerms)) {
    return { ok: false, error: "Choose valid payment terms." };
  }
  if (input.status !== "active" && input.status !== "inactive") {
    return { ok: false, error: "Invalid vendor status." };
  }
  if (!isValidGstin(input.gstin)) {
    return {
      ok: false,
      error: "Enter a valid 15-character GSTIN (e.g. 36AABCU9603R1ZM), or leave it blank.",
    };
  }

  const cleanGstin = input.gstin?.trim().toUpperCase() || null;
  const cleanCode = input.vendorCode?.trim().toUpperCase() || "";
  if (cleanCode.length > 24) {
    return { ok: false, error: "Keep vendor code under 24 characters." };
  }

  const payload = {
    name,
    category: input.category as VendorCategory,
    contact_person: input.contactPerson?.trim().slice(0, 100) || null,
    phone: input.phone?.trim().slice(0, 30) || null,
    email: input.email?.trim().slice(0, 120) || null,
    gstin: cleanGstin,
    address: input.address?.trim().slice(0, 240) || null,
    payment_terms: input.paymentTerms as VendorPaymentTerms,
    upi_or_bank: input.upiOrBank?.trim().slice(0, 160) || null,
    status: input.status,
    notes: input.notes?.trim().slice(0, 300) || null,
  };

  const admin = createAdminClient();
  if (input.id) {
    if (!isUuid(input.id)) return { ok: false, error: "Vendor not found." };
    const { data: existing } = await admin
      .from("vendors")
      .select("id, vendor_code")
      .eq("id", input.id)
      .eq("restaurant_id", ctx.restaurant.id)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Vendor not found." };

    const { error } = await admin
      .from("vendors")
      .update({
        ...payload,
        vendor_code: cleanCode || existing.vendor_code,
      })
      .eq("id", existing.id)
      .eq("restaurant_id", ctx.restaurant.id);
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Another supplier already uses that vendor code." };
      }
      return { ok: false, error: error.message };
    }
  } else {
    const code = cleanCode || (await nextVendorCode(admin, ctx.restaurant.id));
    const { error } = await admin.from("vendors").insert({
      restaurant_id: ctx.restaurant.id,
      vendor_code: code,
      ...payload,
    });
    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Vendor code already exists in this restaurant." };
      }
      return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/r/${slug}/admin/vendors`);
  return { ok: true };
}

export async function deleteVendorAction(
  slug: string,
  vendorId: string,
): Promise<Result> {
  const ctx = await adminOnlyContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(vendorId)) return { ok: false, error: "Vendor not found." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("vendors")
    .delete()
    .eq("id", vendorId)
    .eq("restaurant_id", ctx.restaurant.id);
  if (error) {
    if (error.code === "23503") {
      return {
        ok: false,
        error: "Vendor has purchase orders; mark the vendor Inactive instead.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/r/${slug}/admin/vendors`);
  return { ok: true };
}

export async function createPurchaseOrderAction(
  slug: string,
  input: {
    vendorId: string;
    outletId?: string | null;
    poNumber?: string | null;
    orderDate: string;
    expectedDate?: string | null;
    status?: "draft" | "ordered" | "received";
    invoiceNumber?: string | null;
    notes?: string | null;
    items: PurchaseOrderItemInput[];
  },
): Promise<Result<{ poNumber: string }>> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.vendorId)) return { ok: false, error: "Select a vendor." };
  if (!isValidIsoDate(input.orderDate)) return { ok: false, error: "Invalid order date." };
  if (input.expectedDate && !isValidIsoDate(input.expectedDate)) {
    return { ok: false, error: "Invalid expected delivery date." };
  }

  const totals = computePurchaseOrderTotals(input.items ?? []);
  if (totals.items.length === 0) {
    return {
      ok: false,
      error: "Add at least one valid line item with quantity > 0.",
    };
  }

  const admin = createAdminClient();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("id", input.vendorId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!vendor) return { ok: false, error: "Vendor not found in this restaurant." };

  let outletId: string | null = null;
  if (input.outletId && input.outletId !== "__all__") {
    if (!isUuid(input.outletId)) return { ok: false, error: "Invalid outlet." };
    const { data: outlet } = await admin
      .from("outlets")
      .select("id")
      .eq("id", input.outletId)
      .eq("restaurant_id", ctx.restaurant.id)
      .maybeSingle();
    if (!outlet) return { ok: false, error: "Outlet does not belong to this restaurant." };
    outletId = outlet.id;
  }

  const poStatus =
    input.status === "draft" || input.status === "received"
      ? input.status
      : "ordered";
  const poNum =
    input.poNumber?.trim().toUpperCase().slice(0, 32) ||
    (await nextPoNumber(admin, ctx.restaurant.id, input.orderDate));

  const { error } = await admin.from("vendor_purchase_orders").insert({
    restaurant_id: ctx.restaurant.id,
    outlet_id: outletId,
    vendor_id: vendor.id,
    po_number: poNum,
    order_date: input.orderDate,
    expected_date: input.expectedDate?.trim() || null,
    received_at: poStatus === "received" ? new Date().toISOString() : null,
    invoice_number: input.invoiceNumber?.trim().slice(0, 64) || null,
    status: poStatus,
    items: totals.items as unknown as Json,
    subtotal: totals.subtotal,
    gst_amount: totals.gstAmount,
    total_amount: totals.totalAmount,
    amount_paid: 0,
    payment_status: "unpaid",
    notes: input.notes?.trim().slice(0, 300) || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: `PO number "${poNum}" already exists.` };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/r/${slug}/admin/vendors`);
  return { ok: true, poNumber: poNum };
}

export async function updatePurchaseOrderStatusAction(
  slug: string,
  input: {
    poId: string;
    status: "ordered" | "received" | "cancelled";
    invoiceNumber?: string | null;
  },
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.poId)) return { ok: false, error: "Purchase order not found." };

  const admin = createAdminClient();
  const { data: po } = await admin
    .from("vendor_purchase_orders")
    .select("id, status, amount_paid")
    .eq("id", input.poId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!po) return { ok: false, error: "Purchase order not found." };

  if (po.status === "cancelled") {
    return { ok: false, error: "Cancelled purchase orders cannot be modified." };
  }
  if (input.status === "cancelled" && Number(po.amount_paid ?? 0) > 0.01) {
    return {
      ok: false,
      error: "Cannot cancel a purchase order that already has recorded payments.",
    };
  }

  const updatePayload =
    input.status === "received"
      ? {
          status: input.status,
          received_at: new Date().toISOString(),
          ...(input.invoiceNumber?.trim()
            ? { invoice_number: input.invoiceNumber.trim().slice(0, 64) }
            : {}),
        }
      : { status: input.status };

  const { error } = await admin
    .from("vendor_purchase_orders")
    .update(updatePayload)
    .eq("id", po.id)
    .eq("restaurant_id", ctx.restaurant.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/vendors`);
  return { ok: true };
}

export async function recordVendorPaymentAction(
  slug: string,
  input: {
    vendorId: string;
    purchaseOrderId?: string | null;
    paymentDate: string;
    amount: number;
    paymentMode: string;
    referenceNo?: string | null;
    note?: string | null;
  },
): Promise<Result> {
  const ctx = await opsContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.vendorId)) return { ok: false, error: "Select a vendor." };
  if (!isValidIsoDate(input.paymentDate)) return { ok: false, error: "Invalid payment date." };
  if (!isInEnum(VENDOR_PAYMENT_MODES, input.paymentMode)) {
    return { ok: false, error: "Choose a valid payment mode." };
  }

  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000_000) {
    return { ok: false, error: "Enter a positive payment amount." };
  }

  const admin = createAdminClient();
  const { data: vendor } = await admin
    .from("vendors")
    .select("id")
    .eq("id", input.vendorId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!vendor) return { ok: false, error: "Vendor not found." };

  let linkedPo: { id: string; total_amount: number; status: string } | null = null;
  if (input.purchaseOrderId && input.purchaseOrderId !== "__none__") {
    if (!isUuid(input.purchaseOrderId)) {
      return { ok: false, error: "Invalid purchase order selection." };
    }
    const { data: po } = await admin
      .from("vendor_purchase_orders")
      .select("id, vendor_id, total_amount, status")
      .eq("id", input.purchaseOrderId)
      .eq("restaurant_id", ctx.restaurant.id)
      .maybeSingle();
    if (!po || po.vendor_id !== vendor.id) {
      return { ok: false, error: "Selected PO does not belong to this vendor." };
    }
    if (po.status === "cancelled") {
      return { ok: false, error: "Cannot record payment against a cancelled PO." };
    }
    linkedPo = {
      id: po.id,
      total_amount: Number(po.total_amount ?? 0),
      status: po.status,
    };
  }

  const { error: insertErr } = await admin.from("vendor_payments").insert({
    restaurant_id: ctx.restaurant.id,
    vendor_id: vendor.id,
    purchase_order_id: linkedPo?.id ?? null,
    payment_date: input.paymentDate,
    amount,
    payment_mode: input.paymentMode as VendorPaymentMode,
    reference_no: input.referenceNo?.trim().slice(0, 80) || null,
    note: input.note?.trim().slice(0, 240) || null,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  if (linkedPo) {
    const { data: poPayments } = await admin
      .from("vendor_payments")
      .select("amount")
      .eq("restaurant_id", ctx.restaurant.id)
      .eq("purchase_order_id", linkedPo.id);
    const totalPaid = round2(
      (poPayments ?? []).reduce((s, row) => s + Number(row.amount ?? 0), 0),
    );
    const nextPaymentStatus = derivePoPaymentStatus(linkedPo.total_amount, totalPaid);

    await admin
      .from("vendor_purchase_orders")
      .update({
        amount_paid: totalPaid,
        payment_status: nextPaymentStatus,
      })
      .eq("id", linkedPo.id)
      .eq("restaurant_id", ctx.restaurant.id);
  }

  revalidatePath(`/r/${slug}/admin/vendors`);
  return { ok: true };
}
