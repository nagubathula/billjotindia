import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKey, resolveTimeZone } from "@/lib/time";
import type {
  CorporateClient,
  CorporateInvoice,
  CustomerTab,
  CustomerTabTransaction,
  OutletExpense,
} from "@/lib/types";
import { AccountsWorkbench, type InvoiceSourceOrderRow } from "./AccountsWorkbench";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const VALID_TABS = new Set(["tabs", "invoices", "expenses"]);

export default async function AdminAccountsPage(props: Props) {
  const [params, query] = await Promise.all([props.params, props.searchParams]);
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/accounts`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);
  const scopedOutlets =
    outletIds.length > 0
      ? outletIds
      : ["00000000-0000-0000-0000-000000000000"];

  const todayDate = dayKey(new Date(), resolveTimeZone(outlets[0]?.timezone));
  const initialTab =
    query.tab && VALID_TABS.has(query.tab) ? query.tab : "tabs";

  const admin = createAdminClient();
  const [
    tabsRes,
    tabTxRes,
    clientsRes,
    invoicesRes,
    expensesRes,
    ordersRes,
  ] = await Promise.all([
    admin
      .from("customer_tabs")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("current_balance", { ascending: false })
      .order("customer_name", { ascending: true }),
    admin
      .from("customer_tab_transactions")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("recorded_at", { ascending: false })
      .limit(250),
    admin
      .from("corporate_clients")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("company_name", { ascending: true }),
    admin
      .from("corporate_invoices")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(150),
    admin
      .from("outlet_expenses")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(150),
    admin
      .from("orders")
      .select(
        "id, outlet_id, unique_order_id, customer_name, customer_email, order_type, subtotal, cgst_amount, sgst_amount, total_amount, placed_at",
      )
      .in("outlet_id", scopedOutlets)
      .neq("status", "cancelled")
      .neq("customer_email", "pos+open@billjot.local")
      .order("placed_at", { ascending: false })
      .limit(60),
  ]);

  const tabs = (tabsRes.data ?? []) as CustomerTab[];
  const transactions = (tabTxRes.data ?? []) as CustomerTabTransaction[];
  const clients = (clientsRes.data ?? []) as CorporateClient[];
  const invoices = (invoicesRes.data ?? []) as CorporateInvoice[];
  const expenses = (expensesRes.data ?? []) as OutletExpense[];
  const recentOrders = ((ordersRes.data ?? []) as InvoiceSourceOrderRow[]).map(
    (o) => ({
      ...o,
      subtotal: Number(o.subtotal ?? 0),
      cgst_amount: Number(o.cgst_amount ?? 0),
      sgst_amount: Number(o.sgst_amount ?? 0),
      total_amount: Number(o.total_amount ?? 0),
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="People's Tabs & Corporate Billing"
        description="Manage regular customer Khata tabs, B2B corporate GST tax invoices, and daily petty-cash outlet expenses."
      />

      <AccountsWorkbench
        slug={params.slug}
        restaurantName={restaurant.name}
        todayDate={todayDate}
        initialTab={initialTab}
        outlets={outlets}
        initialTabs={tabs}
        initialTransactions={transactions}
        initialClients={clients}
        initialInvoices={invoices}
        initialExpenses={expenses}
        recentOrders={recentOrders}
      />
    </div>
  );
}
