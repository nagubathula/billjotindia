"use client";

import { useState } from "react";
import Image from "next/image";
import { Minus, Plus, Star, UtensilsCrossed } from "lucide-react";
import { useCart, type SelectedOption } from "@/components/CartProvider";
import { ModifierDialog } from "@/components/ModifierDialog";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function ProductCard({
  product,
  isBestseller = false,
}: {
  product: Product;
  isBestseller?: boolean;
}) {
  const { add, lines, setQuantity } = useCart();
  const [modOpen, setModOpen] = useState(false);
  const isVeg = (product.veg_status ?? "Veg").toLowerCase() === "veg";

  const productLines = lines.filter((l) => l.product.id === product.id);
  const inCart = productLines.reduce((s, l) => s + l.quantity, 0);
  const hasModifiers = !!product.has_addons;

  function handleAdd() {
    if (hasModifiers) setModOpen(true);
    else add(product);
  }

  function handleDecrement() {
    const lastLine = productLines[productLines.length - 1];
    if (!lastLine) return;
    setQuantity(lastLine.configKey, lastLine.quantity - 1);
  }

  function handleIncrement() {
    if (hasModifiers) {
      setModOpen(true);
      return;
    }
    const lastLine = productLines[productLines.length - 1];
    if (lastLine) {
      setQuantity(lastLine.configKey, lastLine.quantity + 1);
    } else {
      add(product);
    }
  }

  function handleConfirmModifiers(options: SelectedOption[]) {
    add(product, options);
    setModOpen(false);
  }

  return (
    <>
      <div className="group flex items-start justify-between gap-4 py-5 first:pt-2 last:pb-2">
        {/* Left: Veg/Non-Veg + Bestseller + Title + Price + Description */}
        <div className="min-w-0 flex-1 space-y-1.5 pr-2">
          <div className="flex items-center gap-2">
            <span
              aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
              title={isVeg ? "Vegetarian" : "Non-vegetarian"}
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border bg-background",
                isVeg ? "border-emerald-600" : "border-rose-600",
              )}
            >
              <span
                className={cn(
                  "block h-2 w-2 rounded-full",
                  isVeg ? "bg-emerald-600" : "bg-rose-600",
                )}
              />
            </span>
            {isBestseller && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                Bestseller
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold leading-snug text-foreground">
            {product.name}
          </h3>

          <div className="text-sm font-semibold tabular-nums text-foreground">
            ₹{Number(product.price).toFixed(0)}
          </div>

          {product.description && (
            <p className="line-clamp-2 pt-0.5 text-xs leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          )}
        </div>

        {/* Right: Square Dish Photo + Overlapping Swiggy ADD / Stepper Button */}
        <div className="relative flex w-[136px] shrink-0 flex-col items-center pb-5">
          <div className="relative h-[120px] w-[136px] overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-xs">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                sizes="140px"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground/40">
                <UtensilsCrossed className="h-7 w-7" strokeWidth={1.5} />
              </div>
            )}
          </div>

          {/* Floating Swiggy ADD / Stepper Control */}
          <div className="absolute bottom-1 left-1/2 z-10 -translate-x-1/2">
            {inCart === 0 ? (
              <button
                type="button"
                onClick={handleAdd}
                className="inline-flex h-9 w-[104px] items-center justify-center rounded-lg border border-border bg-background text-xs font-extrabold tracking-wide text-emerald-600 shadow-md transition hover:bg-emerald-50 active:scale-95 dark:hover:bg-emerald-950/50"
              >
                ADD
                {hasModifiers && (
                  <Plus className="ml-1 h-3 w-3 stroke-[2.5]" />
                )}
              </button>
            ) : (
              <div className="inline-flex h-9 w-[104px] items-center justify-between rounded-lg border border-emerald-600/30 bg-background px-2 text-xs font-extrabold text-emerald-600 shadow-md">
                <button
                  type="button"
                  onClick={handleDecrement}
                  aria-label="Decrease quantity"
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                >
                  <Minus className="h-3.5 w-3.5 stroke-[2.5]" />
                </button>
                <span className="tabular-nums">{inCart}</span>
                <button
                  type="button"
                  onClick={handleIncrement}
                  aria-label="Increase quantity"
                  className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                >
                  <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                </button>
              </div>
            )}
          </div>

          {hasModifiers && (
            <span className="mt-4 text-[10px] font-medium text-muted-foreground">
              Customisable
            </span>
          )}
        </div>
      </div>

      {hasModifiers && (
        <ModifierDialog
          product={modOpen ? product : null}
          open={modOpen}
          onOpenChange={setModOpen}
          onConfirm={handleConfirmModifiers}
        />
      )}
    </>
  );
}
