import { notFound } from "next/navigation";
import { MapPin, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPublicOutlets, getPublicRestaurant } from "@/lib/auth";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import type { Category, Product, PromotionalBanner } from "@/lib/types";

export const revalidate = 30;

type Props = { params: { slug: string } };

export default async function MenuPage({ params }: Props) {
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

  const supabase = createClient();
  const [{ data: products }, { data: categories }, { data: banners }] =
    await Promise.all([
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
    ]);

  const cats = (categories ?? []) as Category[];
  const prods = (products ?? []) as Product[];
  const promos = (banners ?? []) as PromotionalBanner[];
  const o = defaultOutlet; // public-safe outlet fields for the storefront hero

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
    <div className="space-y-8">
      {/* Hero */}
      <header className="pb-2 pt-6 text-center sm:pt-10">
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-primary">
          Order online
        </p>
        <h1 className="mt-2 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
          {restaurant.name}.
        </h1>
        {o && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[15px] text-muted-foreground">
            {(o.address || o.city) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[o.address, o.city].filter(Boolean).join(", ")}
              </span>
            )}
            {o.phone && <span>· {o.phone}</span>}
          </div>
        )}
        {prods.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {prods.length} items across {grouped.length}{" "}
            {grouped.length === 1 ? "section" : "sections"}.
          </p>
        )}
      </header>

      {promos.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {promos.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl p-4 text-white ${b.bg_color ?? "bg-primary"}`}
            >
              <h3 className="text-lg font-semibold">{b.title}</h3>
              {b.description && (
                <p className="text-sm opacity-90">{b.description}</p>
              )}
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

      {/* Sticky category jump nav */}
      {grouped.length > 1 && (
        <nav className="glass-page sticky top-16 z-20 -mx-4 flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          {grouped.map(({ category }) => (
            <a
              key={category.name}
              href={`#cat-${slugify(category.name)}`}
              className="whitespace-nowrap rounded-full bg-card px-3.5 py-1.5 text-[13px] font-medium text-foreground/80 shadow-card transition hover:text-foreground active:scale-[0.97]"
            >
              {category.emoji ? `${category.emoji} ` : ""}
              {category.name}
            </a>
          ))}
        </nav>
      )}

      {grouped.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No items on the menu yet"
          description={`${restaurant.name} hasn't added any items. Check back soon.`}
        />
      ) : (
        grouped.map(({ category, items }) => (
          <section
            key={category.name}
            id={`cat-${slugify(category.name)}`}
            className="scroll-mt-28 space-y-3"
          >
            <h2 className="text-[28px] font-semibold tracking-[-0.025em]">
              {category.emoji ? `${category.emoji} ` : ""}
              {category.name}
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
