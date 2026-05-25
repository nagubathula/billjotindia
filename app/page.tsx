import { createClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/ProductCard";
import type { Category, Product, PromotionalBanner } from "@/lib/types";

export const revalidate = 30;

export default async function HomePage() {
  const supabase = createClient();

  const [{ data: products }, { data: categories }, { data: banners }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("status", "active")
      .order("category")
      .order("name"),
    supabase
      .from("categories")
      .select("*")
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("promotional_banners")
      .select("*")
      .eq("status", "active")
      .order("sort_order"),
  ]);

  const cats = (categories ?? []) as Category[];
  const prods = (products ?? []) as Product[];
  const promos = (banners ?? []) as PromotionalBanner[];

  const grouped = cats.length
    ? cats.map((c) => ({ category: c, items: prods.filter((p) => p.category === c.name) }))
    : Array.from(new Set(prods.map((p) => p.category))).map((name) => ({
        category: { id: 0, name, emoji: null } as unknown as Category,
        items: prods.filter((p) => p.category === name),
      }));

  return (
    <div className="space-y-8">
      {promos.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {promos.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl p-4 text-white ${b.bg_color ?? "bg-primary"}`}
            >
              <h3 className="text-lg font-semibold">{b.title}</h3>
              {b.description && <p className="text-sm opacity-90">{b.description}</p>}
              {b.cta_text && b.cta_link && (
                <a
                  href={b.cta_link}
                  className="mt-2 inline-block rounded bg-white/20 px-3 py-1 text-sm"
                >
                  {b.cta_text}
                </a>
              )}
            </div>
          ))}
        </section>
      )}

      {grouped.length === 0 && (
        <p className="text-center text-neutral-500">
          No products yet. Add rows to the <code>products</code> table in Supabase.
        </p>
      )}

      {grouped.map(({ category, items }) =>
        items.length === 0 ? null : (
          <section key={category.name}>
            <h2 className="mb-3 text-xl font-semibold">
              {category.emoji ? `${category.emoji} ` : ""}
              {category.name}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
