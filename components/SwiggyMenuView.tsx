"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Percent,
  Search,
  ShoppingBag,
  Star,
  Utensils,
  X,
} from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { useCart } from "@/components/CartProvider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Category, Product, PromotionalBanner } from "@/lib/types";

type GroupedCategory = {
  category: Category;
  items: Product[];
};

const DEFAULT_OFFERS = [
  {
    id: "welcome50",
    title: "FLAT ₹50 OFF",
    sub: "USE WELCOME50 | ABOVE ₹299",
  },
  {
    id: "andhra10",
    title: "10% OFF UP TO ₹100",
    sub: "USE ANDHRA10 | ABOVE ₹399",
  },
  {
    id: "bhojanam100",
    title: "FLAT ₹100 OFF",
    sub: "USE BHOJANAM100 | ABOVE ₹699",
  },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function SwiggyMenuView({
  restaurantName,
  restaurantSlug,
  outletAddress,
  outletCity,
  outletPhone,
  grouped,
  promos,
}: {
  restaurantName: string;
  restaurantSlug: string;
  outletAddress?: string | null;
  outletCity?: string | null;
  outletPhone?: string | null;
  grouped: GroupedCategory[];
  promos: PromotionalBanner[];
}) {
  const { count, subtotal, tableName, setTableName } = useCart();
  const [search, setSearch] = useState("");
  const [dietFilter, setDietFilter] = useState<"all" | "veg" | "nonveg">("all");
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);

  // Mark top 2 items of each category as Bestsellers for authentic Swiggy badges
  const bestsellerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of grouped) {
      g.items.slice(0, 2).forEach((item) => ids.add(item.id));
    }
    return ids;
  }, [grouped]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grouped
      .map((g) => ({
        category: g.category,
        items: g.items.filter((p) => {
          const isVeg = (p.veg_status ?? "Veg").toLowerCase() === "veg";
          if (dietFilter === "veg" && !isVeg) return false;
          if (dietFilter === "nonveg" && isVeg) return false;
          if (bestsellerOnly && !bestsellerIds.has(p.id)) return false;
          if (
            q &&
            !p.name.toLowerCase().includes(q) &&
            !(p.description ?? "").toLowerCase().includes(q) &&
            !(p.category ?? "").toLowerCase().includes(q)
          ) {
            return false;
          }
          return true;
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [grouped, search, dietFilter, bestsellerOnly, bestsellerIds]);

  const cuisineSummary = useMemo(
    () =>
      grouped
        .slice(0, 3)
        .map((g) => g.category.name)
        .join(", "),
    [grouped],
  );

  function toggleCategory(name: string) {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {/* Active QR Table Banner */}
      {tableName && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <Utensils className="h-3.5 w-3.5 shrink-0" />
            <span>
              Ordering for <strong>{tableName}</strong> (Dine-in table service)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setTableName(null)}
            className="rounded-md px-1.5 py-0.5 text-[11px] underline hover:no-underline"
          >
            Change
          </button>
        </div>
      )}

      {/* Swiggy Restaurant Header Card */}
      <div className="space-y-3">
        <h1 className="px-1 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {restaurantName}
        </h1>

        <div className="rounded-3xl border border-border bg-gradient-to-b from-muted/30 to-card p-4 shadow-sm sm:p-5">
          <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                <Star className="h-3 w-3 fill-white text-white" />
                4.4
              </span>
              <span>(1.2K+ ratings)</span>
              <span className="text-muted-foreground">•</span>
              <span>₹350 for two</span>
            </div>

            {cuisineSummary && (
              <p className="mt-1.5 text-xs font-semibold text-orange-600 underline decoration-orange-600/40 underline-offset-4">
                {cuisineSummary}
              </p>
            )}

            <div className="mt-3 space-y-1.5 border-l-2 border-border pl-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Outlet</span>
                <span className="text-muted-foreground">
                  {[outletAddress, outletCity].filter(Boolean).join(", ") ||
                    "Main Branch"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="font-semibold text-foreground">
                  20–25 mins
                </span>
                {outletPhone && (
                  <span className="text-muted-foreground">· {outletPhone}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Swiggy Deals For You Strip */}
      <section className="mt-6 space-y-2.5">
        <h2 className="px-1 text-sm font-bold tracking-tight text-foreground">
          Deals for you
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none]">
          {(promos.length > 0
            ? promos.map((b) => ({
                id: b.id,
                title: b.title,
                sub: b.description ?? "Limited time offer",
              }))
            : DEFAULT_OFFERS
          ).map((deal) => (
            <div
              key={deal.id}
              className="flex min-w-[235px] shrink-0 items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 shadow-2xs"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-600">
                <Percent className="h-4 w-4 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-extrabold tracking-tight text-foreground">
                  {deal.title}
                </div>
                <div className="truncate text-[11px] font-semibold text-muted-foreground">
                  {deal.sub}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Menu Divider */}
      <div className="my-6 flex items-center justify-center gap-3 text-[11px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
        <span className="h-px flex-1 bg-border" />
        <span>Menu</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* Sticky Search & Swiggy Filter Pills */}
      <div className="sticky top-16 z-20 -mx-2 space-y-3 bg-background/95 px-2 py-2.5 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for dishes..."
            className="h-11 rounded-xl border-border bg-muted/50 pl-10 pr-9 text-sm font-medium focus-visible:bg-background"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setDietFilter((d) => (d === "veg" ? "all" : "veg"))
            }
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition",
              dietFilter === "veg"
                ? "border-emerald-600 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border border-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            </span>
            Pure Veg
          </button>

          <button
            type="button"
            onClick={() =>
              setDietFilter((d) => (d === "nonveg" ? "all" : "nonveg"))
            }
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition",
              dietFilter === "nonveg"
                ? "border-rose-600 bg-rose-600/10 text-rose-700 dark:text-rose-300"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border border-rose-600">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
            </span>
            Non-Veg
          </button>

          <button
            type="button"
            onClick={() => setBestsellerOnly((v) => !v)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition",
              bestsellerOnly
                ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
            Bestseller
          </button>
        </div>
      </div>

      {/* Category Accordions */}
      {filteredGroups.length === 0 ? (
        <div className="my-12 rounded-2xl border border-dashed border-border py-14 text-center">
          <p className="text-sm font-semibold text-foreground">
            No matching dishes found
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try clearing your search or dietary filters.
          </p>
        </div>
      ) : (
        <div className="mt-3 divide-y-8 divide-muted/70">
          {filteredGroups.map(({ category, items }) => {
            const isCollapsed = !!collapsed[category.name];
            return (
              <section
                key={category.name}
                id={`cat-${slugify(category.name)}`}
                className="scroll-mt-36 py-4 first:pt-1"
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(category.name)}
                  className="flex w-full items-center justify-between py-2 text-left"
                >
                  <h2 className="text-lg font-extrabold tracking-tight text-foreground">
                    {category.name} ({items.length})
                  </h2>
                  {isCollapsed ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-border/70">
                    {items.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        isBestseller={bestsellerIds.has(p.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Floating MENU Jump Button (Swiggy Signature) */}
      <div className="fixed bottom-20 right-5 z-30 sm:right-8">
        {menuOpen && (
          <div className="mb-2 w-64 rounded-2xl border border-border bg-card p-2 shadow-xl">
            <div className="px-3 py-1.5 text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
              Categories
            </div>
            <div className="max-h-64 overflow-y-auto">
              {grouped.map(({ category, items }) => (
                <a
                  key={category.name}
                  href={`#cat-${slugify(category.name)}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <span className="truncate">{category.name}</span>
                  <Badge variant="secondary" className="tabular-nums">
                    {items.length}
                  </Badge>
                </a>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-zinc-900 px-5 text-xs font-extrabold tracking-wider text-white shadow-lg transition hover:bg-zinc-800 active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Utensils className="h-3.5 w-3.5" />
          MENU
        </button>
      </div>

      {/* Swiggy Sticky Bottom View Cart Bar */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-3 z-40 mx-auto max-w-3xl px-4">
          <Link
            href={`/r/${restaurantSlug}/checkout`}
            className="flex h-14 items-center justify-between rounded-2xl bg-[#1ba672] px-5 text-white shadow-xl transition hover:bg-[#179364] active:scale-[0.99]"
          >
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <span>
                {count} {count === 1 ? "item" : "items"} added
              </span>
              <span className="opacity-60">|</span>
              <span className="tabular-nums">₹{subtotal.toFixed(0)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-extrabold tracking-wide">
              <ShoppingBag className="h-4 w-4" />
              <span>VIEW CART</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
