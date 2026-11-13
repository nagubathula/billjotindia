import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createClient } from "@/lib/supabase/server";
import { resolveTimeZone, startOfDay } from "@/lib/time";
import { PageHeader } from "@/components/PageHeader";
import type { Order } from "@/lib/types";
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

  const supabase = await createClient();
  const { data: todayOrdersData } = await supabase
    .from("orders")
    .select(
      "id, outlet_id, source, status, customer_email, total_amount, cgst_amount, sgst_amount, discount_amount, net_payout",
    )
    .in("outlet_id", scoped)
    .gte("placed_at", todayStart.toISOString());

  const orders = (todayOrdersData ?? []) as Pick<
    Order,
    | "id"
    | "outlet_id"
    | "source"
    | "status"
    | "customer_email"
    | "total_amount"
    | "cgst_amount"
    | "sgst_amount"
    | "discount_amount"
    | "net_payout"
  >[];

  const summaries: OutletShiftSummary[] = outlets.map((o) => {
    const outletOrders = orders.filter((ord) => ord.outlet_id === o.id);
    const valid = outletOrders.filter((ord) => ord.status !== "cancelled");
    const cancelled = outletOrders.filter((ord) => ord.status === "cancelled");

    let grossSales = 0;
    let cgst = 0;
    let sgst = 0;
    let discounts = 0;
    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let webSales = 0;
    let aggregatorGross = 0;
    let aggregatorNet = 0;

    for (const ord of valid) {
      const amt = Number(ord.total_amount ?? 0);
      grossSales += amt;
      cgst += Number(ord.cgst_amount ?? 0);
      sgst += Number(ord.sgst_amount ?? 0);
      discounts += Number(ord.discount_amount ?? 0);

      if (ord.source === "pos") {
        const email = (ord.customer_email ?? "").toLowerCase();
        if (email.startsWith("pos+upi") || email.startsWith("pos+razorpay")) {
          upiSales += amt;
        } else if (
          email.startsWith("pos+card") ||
          email.startsWith("pos+stripe")
        ) {
          cardSales += amt;
        } else {
          cashSales += amt;
        }
      } else if (ord.source === "web" || ord.source === "kiosk") {
        webSales += amt;
      } else {
        aggregatorGross += amt;
        aggregatorNet += Number(ord.net_payout ?? amt * 0.78);
      }
    }

    return {
      outletId: o.id,
      outletName: o.name,
      gstin: o.gstin,
      totalOrders: valid.length,
      cancelledOrders: cancelled.length,
      grossSales,
      cgst,
      sgst,
      discounts,
      cashSales,
      upiSales,
      cardSales,
      webSales,
      aggregatorGross,
      aggregatorNet,
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
        description="Reconcile physical cash drawer denominations, log petty cash vouchers, and print thermal day-end closing slips."
      />

      <RegisterWorkbench summaries={summaries} dateLabel={dateLabel} />
    </div>
  );
}
