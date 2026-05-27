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
import type { Category, Product } from "@/lib/types";

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
  const [{ data: cats }, { data: prods }] = await Promise.all([
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
  ]);

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
          />
        </CardContent>
      </Card>
    </div>
  );
}
