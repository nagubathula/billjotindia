import Link from "next/link";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant, getSelectedOutlet } from "@/lib/outlet-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  InventoryMaterial,
  InventoryStockMovement,
  OrderItem,
  Product,
  ProductConfig,
  ProductRecipe,
  Vendor,
  VendorPurchaseOrder,
} from "@/lib/types";
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

  const [selectedOutlet, outlets] = await Promise.all([
    getSelectedOutlet(restaurant.id, params.slug),
    getOutletsForRestaurant(restaurant.id),
  ]);
  const primaryOutletId =
    selectedOutlet?.id ??
    outlets[0]?.id ??
    "00000000-0000-0000-0000-000000000000";

  const admin = createAdminClient();
  const [
    { data: prods },
    { data: recentOrders },
    { data: materialsData },
    { data: recipesData },
    { data: movementsData },
    { data: vendorsData },
    { data: posData },
  ] = await Promise.all([
    admin
      .from("products")
      .select("id, code, name, category, price, veg_status")
      .eq("outlet_id", primaryOutletId)
      .order("category")
      .order("name"),
    admin
      .from("orders")
      .select("id")
      .eq("outlet_id", primaryOutletId)
      .neq("status", "cancelled")
      .limit(300),
    admin
      .from("inventory_materials")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("category")
      .order("name"),
    admin
      .from("product_recipes")
      .select("*")
      .eq("restaurant_id", restaurant.id),
    admin
      .from("inventory_stock_movements")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("vendors")
      .select("id, vendor_code, name, status")
      .eq("restaurant_id", restaurant.id)
      .order("name"),
    admin
      .from("vendor_purchase_orders")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const orderIds = (recentOrders ?? []).map((o) => o.id);
  const soldByProduct = new Map<string, number>();

  if (orderIds.length > 0) {
    const { data: items } = await admin
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
        description={
          selectedOutlet
            ? `${selectedOutlet.name} · DB-backed raw materials, vendor GRN auto-restocking, recipe food-cost BOM, and order stock deduction.`
            : "Manage kitchen raw materials, low-stock par alerts, supplier GRNs, and dish recipe BOM margins."
        }
        actions={
          <Link
            href={`/r/${params.slug}/admin/vendors`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Truck className="mr-1.5 h-3.5 w-3.5" />
            Vendors &amp; POs
          </Link>
        }
      />

      <InventoryWorkbench
        restaurantSlug={params.slug}
        outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        defaultOutletId={primaryOutletId}
        products={productSummaries}
        initialMaterials={(materialsData ?? []) as InventoryMaterial[]}
        initialRecipes={(recipesData ?? []) as ProductRecipe[]}
        initialMovements={(movementsData ?? []) as InventoryStockMovement[]}
        vendors={
          (vendorsData ?? []) as Pick<
            Vendor,
            "id" | "vendor_code" | "name" | "status"
          >[]
        }
        purchaseOrders={(posData ?? []) as VendorPurchaseOrder[]}
      />
    </div>
  );
}
