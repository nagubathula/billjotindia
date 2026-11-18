import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, resolveTimeZone } from "@/lib/time";
import type {
  Vendor,
  VendorPayment,
  VendorPurchaseOrder,
} from "@/lib/types";
import {
  VendorsWorkbench,
  type VendorBalanceSummary,
} from "./VendorsWorkbench";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function AdminVendorsPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const { role } = await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/vendors`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const todayDate = dayKey(new Date(), resolveTimeZone(outlets[0]?.timezone));

  const admin = createAdminClient();
  const [vendorsRes, posRes, paymentsRes] = await Promise.all([
    admin
      .from("vendors")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("vendor_code", { ascending: true }),
    admin
      .from("vendor_purchase_orders")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(150),
    admin
      .from("vendor_payments")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(150),
  ]);

  const vendors = (vendorsRes.data ?? []) as Vendor[];
  const purchaseOrders = (posRes.data ?? []) as VendorPurchaseOrder[];
  const payments = (paymentsRes.data ?? []) as VendorPayment[];

  // Aggregate total billed (non-cancelled POs) and total paid across all records
  const [{ data: allBilledPos }, { data: allVendorPayments }] =
    await Promise.all([
      admin
        .from("vendor_purchase_orders")
        .select("vendor_id, total_amount")
        .eq("restaurant_id", restaurant.id)
        .neq("status", "cancelled"),
      admin
        .from("vendor_payments")
        .select("vendor_id, amount")
        .eq("restaurant_id", restaurant.id),
    ]);

  const balanceByVendorId: Record<string, VendorBalanceSummary> = {};
  for (const v of vendors) {
    balanceByVendorId[v.id] = { totalBilled: 0, totalPaid: 0, outstanding: 0 };
  }
  for (const row of allBilledPos ?? []) {
    const cur = balanceByVendorId[row.vendor_id] ?? {
      totalBilled: 0,
      totalPaid: 0,
      outstanding: 0,
    };
    cur.totalBilled += Number(row.total_amount ?? 0);
    balanceByVendorId[row.vendor_id] = cur;
  }
  for (const row of allVendorPayments ?? []) {
    const cur = balanceByVendorId[row.vendor_id] ?? {
      totalBilled: 0,
      totalPaid: 0,
      outstanding: 0,
    };
    cur.totalPaid += Number(row.amount ?? 0);
    balanceByVendorId[row.vendor_id] = cur;
  }
  for (const bal of Object.values(balanceByVendorId)) {
    bal.outstanding = Math.round((bal.totalBilled - bal.totalPaid) * 100) / 100;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors & Purchase Orders"
        description="Manage raw-material suppliers, GST purchase orders, goods receipts (GRN), and vendor payables."
      />

      <VendorsWorkbench
        slug={params.slug}
        role={role}
        todayDate={todayDate}
        outlets={outlets}
        vendors={vendors}
        purchaseOrders={purchaseOrders}
        payments={payments}
        balanceByVendorId={balanceByVendorId}
      />
    </div>
  );
}
