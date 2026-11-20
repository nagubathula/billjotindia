import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import {
  summarizeRegisterOrders,
  type OrderPaymentLeg,
} from "@/lib/register";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, resolveTimeZone, startOfDay } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import type { Order, OutletExpense, RegisterShift } from "@/lib/types";
import {
  RegisterWorkbench,
  type OutletShiftSummary,
} from "./RegisterWorkbench";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function AdminRegisterPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/register`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scoped =
    outletIds.length > 0
      ? outletIds
      : ["00000000-0000-0000-0000-000000000000"];

  const timeZone = resolveTimeZone(outlets[0]?.timezone);
  const now = new Date();
  const todayStart = startOfDay(now, timeZone);
  const todayDate = dayKey(now, timeZone);

  const supabase = await createClient();
  const admin = createAdminClient();
  const [
    { data: todayOrdersData },
    { data: todayExpensesData },
    { data: shiftsData },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, outlet_id, source, status, customer_name, customer_email, payment_mode, external_status, token_number, placed_at, total_amount, cgst_amount, sgst_amount, discount_amount, net_payout",
      )
      .in("outlet_id", scoped)
      .gte("placed_at", todayStart.toISOString()),
    admin
      .from("outlet_expenses")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("expense_date", todayDate)
      .order("created_at", { ascending: false }),
    admin
      .from("register_shifts")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("shift_date", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);

  const orders = (todayOrdersData ?? []) as Array<
    Pick<
      Order,
      | "id"
      | "outlet_id"
      | "source"
      | "status"
      | "customer_name"
      | "customer_email"
      | "payment_mode"
      | "external_status"
      | "token_number"
      | "placed_at"
      | "total_amount"
      | "cgst_amount"
      | "sgst_amount"
      | "discount_amount"
      | "net_payout"
    >
  >;

  const orderIds = orders.map((o) => o.id);
  const paymentsByOrderId = new Map<string, OrderPaymentLeg[]>();
  if (orderIds.length > 0) {
    const { data: legs } = await admin
      .from("order_payments")
      .select("order_id, payment_mode, amount")
      .in("order_id", orderIds);
    for (const l of legs ?? []) {
      const list = paymentsByOrderId.get(l.order_id) ?? [];
      list.push(l);
      paymentsByOrderId.set(l.order_id, list);
    }
  }

  const summaries: OutletShiftSummary[] = outlets.map((o) => {
    const outletOrders = orders.filter((ord) => ord.outlet_id === o.id);
    const agg = summarizeRegisterOrders(outletOrders, paymentsByOrderId);
    return {
      outletId: o.id,
      outletName: o.name,
      gstin: o.gstin,
      ...agg,
    };
  });

  const dateLabel = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Day-End Register & Petty Cash (Z-Report)"
        description="Reconcile physical cash drawer denominations, log petty cash vouchers, persist audited Z-Close shifts, and review shift history."
      />

      <RegisterWorkbench
        summaries={summaries}
        initialExpenses={(todayExpensesData ?? []) as OutletExpense[]}
        initialShifts={(shiftsData ?? []) as RegisterShift[]}
        todayDate={todayDate}
        dateLabel={dateLabel}
        restaurantSlug={params.slug}
      />
    </div>
  );
}
