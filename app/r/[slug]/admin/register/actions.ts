"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { isValidIsoDate } from "@/lib/hr";
import {
  computeDrawerReconciliation,
  summarizeRegisterOrders,
} from "@/lib/register";
import { createAdminClient } from "@/lib/supabase/admin";
import { startOfDay } from "@/lib/time";
import type { Json } from "@/lib/database.types";
import type { RegisterShift } from "@/lib/types";
import { isUuid } from "@/lib/utils";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function shiftContext(slug: string, outletId: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  const { user, role } = await requireRole(["admin", "manager"], {
    restaurantId: restaurant.id,
    redirectTo: `/r/${slug}/admin/register`,
  });
  if (!isUuid(outletId)) return null;
  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("id, restaurant_id, timezone")
    .eq("id", outletId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!outlet) return null;
  return { restaurant, outlet, user, role, admin };
}

async function computeOutletShiftMetrics(params: {
  admin: ReturnType<typeof createAdminClient>;
  restaurantId: string;
  outletId: string;
  shiftDate: string;
  timezone: string | null;
}) {
  const dayStart = startOfDay(
    new Date(`${params.shiftDate}T12:00:00Z`),
    params.timezone ?? undefined,
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000 - 1);

  const [{ data: ordersData }, { data: expData }] = await Promise.all([
    params.admin
      .from("orders")
      .select(
        "id, outlet_id, source, status, customer_name, customer_email, payment_mode, external_status, token_number, placed_at, total_amount, cgst_amount, sgst_amount, discount_amount, net_payout",
      )
      .eq("outlet_id", params.outletId)
      .gte("placed_at", dayStart.toISOString())
      .lte("placed_at", dayEnd.toISOString()),
    params.admin
      .from("outlet_expenses")
      .select("outlet_id, payment_mode, amount")
      .eq("restaurant_id", params.restaurantId)
      .eq("expense_date", params.shiftDate),
  ]);

  const orderIds = (ordersData ?? []).map((o) => o.id);
  const paymentsByOrderId = new Map<
    string,
    Array<{ order_id: string; payment_mode: string; amount: number }>
  >();

  if (orderIds.length > 0) {
    const { data: legs } = await params.admin
      .from("order_payments")
      .select("order_id, payment_mode, amount")
      .in("order_id", orderIds);
    for (const l of legs ?? []) {
      const list = paymentsByOrderId.get(l.order_id) ?? [];
      list.push({
        order_id: l.order_id,
        payment_mode: l.payment_mode,
        amount: Number(l.amount ?? 0),
      });
      paymentsByOrderId.set(l.order_id, list);
    }
  }

  const summary = summarizeRegisterOrders(ordersData ?? [], paymentsByOrderId);
  const cashPettyExpenses = (expData ?? [])
    .filter(
      (e) =>
        e.payment_mode === "cash" &&
        (e.outlet_id === null || e.outlet_id === params.outletId),
    )
    .reduce((s, e) => s + Number(e.amount ?? 0), 0);

  return { summary, cashPettyExpenses };
}

export async function saveShiftFloatAction(
  slug: string,
  input: {
    outletId: string;
    shiftDate: string;
    openingFloat: number;
  },
): Promise<Result<{ shift: RegisterShift }>> {
  if (!isValidIsoDate(input.shiftDate)) {
    return { ok: false, error: "Invalid shift date." };
  }
  const ctx = await shiftContext(slug, input.outletId);
  if (!ctx) return { ok: false, error: "Outlet or permission check failed." };

  const openingFloat = Math.max(0, Math.round(Number(input.openingFloat) || 0));
  const { summary, cashPettyExpenses } = await computeOutletShiftMetrics({
    admin: ctx.admin,
    restaurantId: ctx.restaurant.id,
    outletId: ctx.outlet.id,
    shiftDate: input.shiftDate,
    timezone: ctx.outlet.timezone,
  });

  const expectedCash = Math.max(
    0,
    Math.round(openingFloat + summary.cashSales - cashPettyExpenses),
  );

  const { data: existing } = await ctx.admin
    .from("register_shifts")
    .select("*")
    .eq("outlet_id", ctx.outlet.id)
    .eq("shift_date", input.shiftDate)
    .maybeSingle();

  if (existing) {
    if (existing.status === "closed") {
      return { ok: false, error: "Reopen the closed shift before editing float." };
    }
    const { data: updated, error } = await ctx.admin
      .from("register_shifts")
      .update({
        opening_float: openingFloat,
        expected_cash: expectedCash,
        cash_sales: summary.cashSales,
        upi_sales: summary.upiSales,
        card_sales: summary.cardSales,
        tab_sales: summary.tabSales,
        online_sales: summary.webSales,
        petty_cash_expenses: cashPettyExpenses,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !updated) {
      return { ok: false, error: error?.message ?? "Failed to update float." };
    }
    revalidatePath(`/r/${slug}/admin/register`);
    return { ok: true, shift: updated as RegisterShift };
  }

  const { data: inserted, error } = await ctx.admin
    .from("register_shifts")
    .insert({
      restaurant_id: ctx.restaurant.id,
      outlet_id: ctx.outlet.id,
      shift_date: input.shiftDate,
      status: "open",
      opening_float: openingFloat,
      expected_cash: expectedCash,
      cash_sales: summary.cashSales,
      upi_sales: summary.upiSales,
      card_sales: summary.cardSales,
      tab_sales: summary.tabSales,
      online_sales: summary.webSales,
      petty_cash_expenses: cashPettyExpenses,
      opened_by: ctx.user.email ?? ctx.role,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Failed to open shift." };
  }

  revalidatePath(`/r/${slug}/admin/register`);
  return { ok: true, shift: inserted as RegisterShift };
}

export async function closeRegisterShiftAction(
  slug: string,
  input: {
    outletId: string;
    shiftDate: string;
    openingFloat: number;
    denominations: Record<string, number>;
    varianceNote?: string | null;
  },
): Promise<Result<{ shift: RegisterShift }>> {
  if (!isValidIsoDate(input.shiftDate)) {
    return { ok: false, error: "Invalid shift date." };
  }
  const ctx = await shiftContext(slug, input.outletId);
  if (!ctx) return { ok: false, error: "Outlet or permission check failed." };

  const openingFloat = Math.max(0, Math.round(Number(input.openingFloat) || 0));
  const { summary, cashPettyExpenses } = await computeOutletShiftMetrics({
    admin: ctx.admin,
    restaurantId: ctx.restaurant.id,
    outletId: ctx.outlet.id,
    shiftDate: input.shiftDate,
    timezone: ctx.outlet.timezone,
  });

  const rec = computeDrawerReconciliation({
    openingFloat,
    cashSales: summary.cashSales,
    cashPettyExpenses,
    denominations: input.denominations ?? {},
  });

  const cleanNote = input.varianceNote?.trim().slice(0, 300) || null;
  if (Math.abs(rec.variance) >= 50 && !cleanNote) {
    return {
      ok: false,
      error: `Enter a short reason explaining the ₹${Math.abs(rec.variance)} cash variance before closing.`,
    };
  }

  const nowIso = new Date().toISOString();
  const payload = {
    restaurant_id: ctx.restaurant.id,
    outlet_id: ctx.outlet.id,
    shift_date: input.shiftDate,
    status: "closed" as const,
    opening_float: openingFloat,
    expected_cash: rec.expectedCash,
    counted_cash: rec.countedCash,
    variance: rec.variance,
    denominations: input.denominations as unknown as Json,
    cash_sales: summary.cashSales,
    upi_sales: summary.upiSales,
    card_sales: summary.cardSales,
    tab_sales: summary.tabSales,
    online_sales: summary.webSales,
    petty_cash_expenses: cashPettyExpenses,
    variance_note: cleanNote,
    closed_by: ctx.user.email ?? ctx.role,
    closed_at: nowIso,
  };

  const { data: saved, error } = await ctx.admin
    .from("register_shifts")
    .upsert(payload, { onConflict: "outlet_id,shift_date" })
    .select("*")
    .single();

  if (error || !saved) {
    return { ok: false, error: error?.message ?? "Failed to close register shift." };
  }

  revalidatePath(`/r/${slug}/admin/register`);
  return { ok: true, shift: saved as RegisterShift };
}

export async function reopenRegisterShiftAction(
  slug: string,
  input: { shiftId: string },
): Promise<Result<{ shift: RegisterShift }>> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], {
    restaurantId: restaurant.id,
    redirectTo: `/r/${slug}/admin/register`,
  });
  if (!isUuid(input.shiftId)) return { ok: false, error: "Shift not found." };

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("register_shifts")
    .update({ status: "open", closed_at: null })
    .eq("id", input.shiftId)
    .eq("restaurant_id", restaurant.id)
    .select("*")
    .single();

  if (error || !updated) {
    return { ok: false, error: error?.message ?? "Failed to reopen shift." };
  }

  revalidatePath(`/r/${slug}/admin/register`);
  return { ok: true, shift: updated as RegisterShift };
}
