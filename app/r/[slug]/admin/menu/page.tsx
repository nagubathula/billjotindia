import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDefaultOutletForRestaurant, getRestaurantBySlug } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { CategoryManager } from "./CategoryManager";
import { ProductManager } from "./ProductManager";
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

type Props = { params: { slug: string } };

export default async function MenuPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlet = await getDefaultOutletForRestaurant(restaurant.id);
  if (!outlet) {
    return (
      <p className="text-sm text-muted-foreground">
        Configure an outlet first in Settings before adding menu items.
      </p>
    );
  }

  const supabase = createClient();
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

  const groupList = (grps ?? []) as CustomizationGroup[];

  // Options for this outlet's groups, fetched separately then grouped.
  const groupIds = groupList.map((g) => g.id);
  const { data: opts } =
    groupIds.length > 0
      ? await supabase
          .from("customization_options")
          .select("*")
          .in("group_id", groupIds)
          .order("sort_order")
      : { data: [] as CustomizationOption[] };

  const optsByGroup = new Map<number, CustomizationOption[]>();
  for (const o of (opts ?? []) as CustomizationOption[]) {
    const arr = optsByGroup.get(o.group_id) ?? [];
    arr.push(o);
    optsByGroup.set(o.group_id, arr);
  }
  const groupsWithOptions: GroupWithOptions[] = groupList.map((g) => ({
    group: g,
    options: optsByGroup.get(g.id) ?? [],
  }));

  // Only active groups are selectable when attaching to a product.
  const attachableGroups = groupList
    .filter((g) => g.status === "active")
    .map((g) => ({ id: g.id, display_name: g.display_name }));

  // product_id → [group_id, …], scoped to this outlet's groups.
  const ownGroupIds = new Set(groupIds);
  const productGroupIds: Record<number, number[]> = {};
  for (const l of (links ?? []) as ProductCustomization[]) {
    if (!ownGroupIds.has(l.group_id)) continue;
    (productGroupIds[l.product_id] ??= []).push(l.group_id);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu"
        description={
          <>
            Categories and products. Changes show up in the POS and customer
            storefront immediately.
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Group items on the menu. Customers see them as sections; the POS
            uses them as category tabs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryManager
            slug={params.slug}
            categories={(cats ?? []) as Category[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            Items customers and cashiers can order. GST rate is GST-inclusive
            for typical Indian QSR pricing (we back-compute the tax component).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductManager
            slug={params.slug}
            categories={(cats ?? []) as Category[]}
            products={(prods ?? []) as Product[]}
            groups={attachableGroups}
            productGroupIds={productGroupIds}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customizations</CardTitle>
          <CardDescription>
            Reusable add-on sets (sizes, toppings, extras). Build them here,
            then attach them to products from the product editor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CustomizationGroupManager
            slug={params.slug}
            groups={groupsWithOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
