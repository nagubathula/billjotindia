import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import type { OrderItem, Product, ProductConfig } from "@/lib/types";
import {
  InventoryWorkbench,
  type MenuProductSummary,
} from "./InventoryWorkbench";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function AdminInventoryPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/inventory`,
  });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const primaryOutletId =
    outlets[0]?.id ?? "00000000-0000-0000-0000-000000000000";

  const supabase = await createClient();
  const [{ data: prods }, { data: recentOrders }] = await Promise.all([
    supabase
      .from("products")
      .select("id, code, name, category, price, veg_status")
      .eq("outlet_id", primaryOutletId)
      .order("category")
      .order("name"),
    supabase
      .from("orders")
      .select("id")
      .eq("outlet_id", primaryOutletId)
      .neq("status", "cancelled")
      .limit(300),
  ]);

  const orderIds = (recentOrders ?? []).map((o) => o.id);
  const soldByProduct = new Map<string, number>();

  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("quantity, product_config")
      .in("order_id", orderIds);

    for (const it of (items ?? []) as Pick<
      OrderItem,
      "quantity" | "product_config"
    >[]) {
      const cfg = it.product_config as unknown as ProductConfig | null;
      const pid = cfg?.product_id;
      if (pid) {
        soldByProduct.set(pid, (soldByProduct.get(pid) ?? 0) + it.quantity);
      }
    }
  }

  const productSummaries: MenuProductSummary[] = (
    (prods ?? []) as Pick<
      Product,
      "id" | "code" | "name" | "category" | "price" | "veg_status"
    >[]
  ).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    category: p.category,
    price: Number(p.price ?? 0),
    veg_status: p.veg_status,
    sold30d: soldByProduct.get(p.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory & Recipe BOM"
        description="Track kitchen raw materials, low-stock par alerts, supplier purchase orders, and dish-level food cost margins."
      />

      <InventoryWorkbench products={productSummaries} />
    </div>
  );
}
