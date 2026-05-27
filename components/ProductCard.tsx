"use client";

import { useState } from "react";
import Image from "next/image";
import { Plus, Check, Settings2 } from "lucide-react";
import { useCart, type SelectedOption } from "@/components/CartProvider";
import { Button } from "@/components/ui/button";
import { ModifierDialog } from "@/components/ModifierDialog";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const { add, lines } = useCart();
  const [modOpen, setModOpen] = useState(false);
  const isVeg = (product.veg_status ?? "Veg").toLowerCase() === "veg";
  const inCart = lines
    .filter((l) => l.product.id === product.id)
    .reduce((s, l) => s + l.quantity, 0);
  const hasModifiers = !!product.has_addons;

  function handleAdd() {
    if (hasModifiers) setModOpen(true);
    else add(product);
  }

  function handleConfirmModifiers(options: SelectedOption[]) {
    add(product, options);
    setModOpen(false);
  }

  return (
    <>
      <div className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md">
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl opacity-50">
              🍽️
            </div>
          )}
          <span
            aria-label={isVeg ? "Vegetarian" : "Non-vegetarian"}
            title={isVeg ? "Vegetarian" : "Non-vegetarian"}
            className={cn(
              "absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded-sm border bg-white shadow",
              isVeg ? "border-emerald-700" : "border-red-700",
            )}
          >
            <span
              className={cn(
                "block h-2 w-2 rounded-full",
                isVeg ? "bg-emerald-600" : "bg-red-600",
              )}
            />
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold leading-tight">{product.name}</h3>
            {product.description && (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {product.description}
              </p>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <span className="text-base font-semibold text-foreground">
              ₹{Number(product.price).toFixed(0)}
            </span>
            <Button
              size="sm"
              variant={inCart > 0 ? "secondary" : "default"}
              onClick={handleAdd}
              className="gap-1"
            >
              {hasModifiers ? (
                <>
                  <Settings2 className="h-3 w-3" /> Customize
                </>
              ) : inCart > 0 ? (
                <>
                  <Check className="h-3 w-3" /> Added · {inCart}
                </>
              ) : (
                <>
                  <Plus className="h-3 w-3" /> Add
                </>
              )}
            </Button>
          </div>
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
