import { notFound } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPublicOutlets, getPublicRestaurant } from "@/lib/auth";
import {
  buildModifiersByProductMap,
  type ModifierGroupData,
  type ModifierOptionData,
} from "@/lib/customizations";
import { SwiggyMenuView } from "@/components/SwiggyMenuView";
import { EmptyState } from "@/components/EmptyState";
import type {
  Category,
  Product,
  ProductCustomization,
  PromotionalBanner,
} from "@/lib/types";

export const revalidate = 30;

type Props = { params: Promise<{ slug: string }> };

export default async function MenuPage(props: Props) {
  const params = await props.params;
  const restaurant = await getPublicRestaurant(params.slug);
  if (!restaurant) notFound();

  const outlets = await getPublicOutlets(restaurant.id);
  const defaultOutlet = outlets[0] ?? null;
  if (!defaultOutlet) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="Coming soon"
        description={`${restaurant.name} hasn't set up any outlets yet. Check back later.`}
      />
    );
  }

  const supabase = await createClient();
  const [
    { data: products },
    { data: categories },
    { data: banners },
    { data: groups },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("status", "active")
      .eq("outlet_id", defaultOutlet.id)
      .order("category")
      .order("name"),
    supabase
      .from("categories")
      .select("*")
      .eq("status", "active")
      .eq("outlet_id", defaultOutlet.id)
      .order("sort_order"),
    supabase
      .from("promotional_banners")
      .select("*")
      .eq("status", "active")
      .eq("outlet_id", defaultOutlet.id)
      .order("sort_order"),
    supabase
      .from("customization_groups")
      .select("*")
      .eq("status", "active")
      .eq("outlet_id", defaultOutlet.id)
      .order("sort_order"),
  ]);

  const cats = (categories ?? []) as Category[];
  const prods = (products ?? []) as Product[];
  const promos = (banners ?? []) as PromotionalBanner[];
  const groupRows = (groups ?? []) as ModifierGroupData[];
  const groupIds = groupRows.map((g) => g.id);
  const prodIds = prods.map((p) => p.id);

  const [{ data: links }, { data: options }] = await Promise.all([
    prodIds.length > 0
      ? supabase
          .from("product_customizations")
          .select("*")
          .in("product_id", prodIds)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    groupIds.length > 0
      ? supabase
          .from("customization_options")
          .select("*")
          .in("group_id", groupIds)
          .eq("status", "active")
          .order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);

  const modifiersByProduct = buildModifiersByProductMap({
    links: (links ?? []) as ProductCustomization[],
    groups: groupRows,
    options: (options ?? []) as ModifierOptionData[],
  });

  const grouped = cats.length
    ? cats
        .map((c) => ({
          category: c,
          items: prods.filter((p) => p.category === c.name),
        }))
        .filter((g) => g.items.length > 0)
    : Array.from(new Set(prods.map((p) => p.category))).map((name) => ({
        category: { id: name, name, emoji: null } as unknown as Category,
        items: prods.filter((p) => p.category === name),
      }));

  return (
    <SwiggyMenuView
      restaurantName={restaurant.name}
      restaurantSlug={params.slug}
      outletAddress={defaultOutlet.address}
      outletCity={defaultOutlet.city}
      outletPhone={defaultOutlet.phone}
      grouped={grouped}
      promos={promos}
      modifiersByProduct={modifiersByProduct}
    />
  );
}
