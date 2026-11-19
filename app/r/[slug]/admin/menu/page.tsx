import { notFound } from "next/navigation";
import { Layers, Settings2, ShoppingBag, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug } from "@/lib/auth";
import { getOutletsForRestaurant, getSelectedOutlet } from "@/lib/outlet-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";
import { CategoryManager } from "./CategoryManager";
import { MenuOutletBar } from "./MenuOutletBar";
import { ProductManager, type AttachedGroupConfig, type GroupOption } from "./ProductManager";
import {
  CustomizationGroupManager,
  type GroupWithOptions,
} from "./CustomizationGroupManager";
import type {
  Category,
  CustomizationGroup,
  CustomizationOption,
  Product,
  ProductCustomization,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function MenuPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const [outlet, outlets] = await Promise.all([
    getSelectedOutlet(restaurant.id, params.slug),
    getOutletsForRestaurant(restaurant.id),
  ]);
  if (!outlet) {
    return (
      <p className="text-sm text-muted-foreground">
        Configure an outlet first in Settings before adding menu items.
      </p>
    );
  }

  const supabase = await createClient();
  const [{ data: cats }, { data: prods }, { data: grps }, { data: links }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .eq("outlet_id", outlet.id)
        .order("sort_order"),
      supabase
        .from("products")
        .select("*")
        .eq("outlet_id", outlet.id)
        .order("category")
        .order("name"),
      supabase
        .from("customization_groups")
        .select("*")
        .eq("outlet_id", outlet.id)
        .order("sort_order"),
      supabase
        .from("product_customizations")
        .select("*")
        .order("sort_order"),
    ]);

  const categories = (cats ?? []) as Category[];
  const products = (prods ?? []) as Product[];
  const groupList = (grps ?? []) as CustomizationGroup[];

  const groupIds = groupList.map((g) => g.id);
  const { data: opts } =
    groupIds.length > 0
      ? await supabase
          .from("customization_options")
          .select("*")
          .in("group_id", groupIds)
          .order("sort_order")
      : { data: [] as CustomizationOption[] };

  const optsByGroup = new Map<string, CustomizationOption[]>();
  for (const o of (opts ?? []) as CustomizationOption[]) {
    const arr = optsByGroup.get(o.group_id) ?? [];
    arr.push(o);
    optsByGroup.set(o.group_id, arr);
  }
  const groupsWithOptions: GroupWithOptions[] = groupList.map((g) => ({
    group: g,
    options: optsByGroup.get(g.id) ?? [],
  }));

  const attachableGroups: GroupOption[] = groupList
    .filter((g) => g.status === "active")
    .map((g) => ({
      id: g.id,
      display_name: g.display_name,
      is_required: Boolean(g.is_required || (g.min_selections ?? 0) > 0),
      selection_type: g.selection_type,
    }));

  const ownGroupIds = new Set(groupIds);
  const productGroups: Record<string, AttachedGroupConfig[]> = {};
  for (const l of (links ?? []) as ProductCustomization[]) {
    if (!ownGroupIds.has(l.group_id)) continue;
    (productGroups[l.product_id] ??= []).push({
      group_id: l.group_id,
      is_required_override: l.is_required_override ?? null,
    });
  }

  const activeProductsCount = products.filter((p) => p.status === "active").length;
  const activeCategoriesCount = categories.filter((c) => c.status === "active").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu & Pricing"
        description={`Managing menu for ${outlet.name}. Updates reflect in the POS and storefront immediately.`}
        actions={
          <MenuOutletBar
            slug={params.slug}
            outlets={outlets}
            currentOutletId={outlet.id}
          />
        }
      />

      {/* Quick catalog summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Total items</span>
              <ShoppingBag className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {products.length}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>In stock (Active)</span>
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {activeProductsCount}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Categories</span>
              <Tag className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {activeCategoriesCount} / {categories.length}
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Modifier groups</span>
              <Settings2 className="h-3.5 w-3.5" />
            </div>
            <div className="text-2xl font-semibold tabular-nums">
              {groupList.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed menu management */}
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">
            Products ({products.length})
          </TabsTrigger>
          <TabsTrigger value="categories">
            Categories ({categories.length})
          </TabsTrigger>
          <TabsTrigger value="customizations">
            Customizations ({groupList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle>Products</CardTitle>
              <CardDescription>
                Items cashiers and online customers can order. Toggle the switch to mark items in or out of stock immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
              <ProductManager
                slug={params.slug}
                categories={categories}
                products={products}
                groups={attachableGroups}
                productGroups={productGroups}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle>Categories</CardTitle>
              <CardDescription>
                Group items on the menu. Customers see them as sections; the POS uses them as category filter tabs.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
              <CategoryManager slug={params.slug} categories={categories} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customizations">
          <Card>
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle>Customization Groups</CardTitle>
              <CardDescription>
                Reusable add-on sets (variants, sizes, min/max toppings, free allowances, dietary tags). Attach them to products in prompt order.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
              <CustomizationGroupManager
                slug={params.slug}
                groups={groupsWithOptions}
                outlets={outlets}
                currentOutletId={outlet.id}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
