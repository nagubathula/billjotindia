"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Minus, Plus, ShoppingBag, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useCart, type CartLine } from "@/components/CartProvider";
import { EmptyState } from "@/components/EmptyState";
import { ModifierDialog } from "@/components/ModifierDialog";
import { formatSelectedOptionLabel } from "@/lib/customizations";
import { cn } from "@/lib/utils";

export default function CartPage() {
  const { slug } = useParams<{ slug: string }>();
  const { lines, setQuantity, updateLine, remove, subtotal, clear } = useCart();
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-md py-8">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Browse the menu and tap items to add them to your cart."
          action={
            <Link
              href={`/r/${slug}`}
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              Browse menu
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Your cart</h1>

        <Card className="p-0">
          <ul className="divide-y">
            {lines.map((line) => {
              const {
                configKey,
                product,
                quantity,
                selectedOptions,
                instructions,
                unitPrice,
              } = line;
              return (
                <li key={configKey} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{product.name}</p>
                      {product.has_addons && (
                        <button
                          type="button"
                          onClick={() => setEditingLine(line)}
                          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                        >
                          <SlidersHorizontal className="h-2.5 w-2.5" />
                          Customize
                        </button>
                      )}
                    </div>
                    {selectedOptions.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedOptions
                          .map((o) => formatSelectedOptionLabel(o))
                          .join(" · ")}
                      </p>
                    )}
                    {instructions && (
                      <p className="truncate text-xs text-amber-700 dark:text-amber-400">
                        Note: {instructions}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      ₹{unitPrice.toFixed(0)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQuantity(configKey, quantity - 1)}
                      aria-label="Decrease"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm tabular-nums">
                      {quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQuantity(configKey, quantity + 1)}
                      aria-label="Increase"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">
                    ₹{(unitPrice * quantity).toFixed(0)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => remove(configKey)}
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>

        <Button
          variant="ghost"
          size="sm"
          onClick={clear}
          className="text-muted-foreground"
        >
          <Trash2 className="mr-1 h-3 w-3" /> Clear cart
        </Button>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Order summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {lines.reduce((s, l) => s + l.quantity, 0)} items
              </span>
              <span className="tabular-nums">₹{subtotal.toFixed(0)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-semibold">
              <span>Subtotal</span>
              <span className="tabular-nums">₹{subtotal.toFixed(0)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Taxes and packing charges are calculated at checkout.
            </p>
            <Link
              href={`/r/${slug}/checkout`}
              className={cn(buttonVariants({ size: "default" }), "mt-2 w-full")}
            >
              Continue to checkout
            </Link>
          </CardContent>
        </Card>
      </aside>

      <ModifierDialog
        product={editingLine?.product ?? null}
        open={editingLine !== null}
        onOpenChange={(o) => {
          if (!o) setEditingLine(null);
        }}
        initialSelections={editingLine?.selectedOptions}
        initialInstructions={editingLine?.instructions ?? ""}
        confirmLabel="Save changes"
        onConfirm={(opts, note) => {
          if (editingLine) {
            updateLine(editingLine.configKey, opts, note);
          }
          setEditingLine(null);
        }}
      />
    </div>
  );
}
