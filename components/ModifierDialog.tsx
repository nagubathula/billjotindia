"use client";

// Modifier modal for products with has_addons = true. Fetches the product's
// customization groups + options lazily, lets the user pick (radio for
// single-select groups, checkbox for multi), and emits the result back to
// the caller as an onConfirm(selectedOptions[]) callback. The caller decides
// what to do with the result (add to cart, ring up at POS, etc.).

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  getProductModifiers,
  type ProductModifiers,
} from "@/app/actions/modifiers";
import type { SelectedOption } from "@/components/CartProvider";
import type { Product } from "@/lib/types";

type Props = {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selectedOptions: SelectedOption[]) => void;
};

export function ModifierDialog({ product, open, onOpenChange, onConfirm }: Props) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<ProductModifiers | null>(null);
  // group_id → set of selected option_ids
  const [picks, setPicks] = useState<Map<number, Set<number>>>(new Map());

  useEffect(() => {
    if (!open || !product) {
      setData(null);
      setPicks(new Map());
      return;
    }
    start(async () => {
      const res = await getProductModifiers(product.id);
      setData(res);
      // Pre-select first option for single-select required groups so the
      // user can't accidentally submit with nothing picked there.
      const initial = new Map<number, Set<number>>();
      for (const { group, options } of res.groups) {
        if (group.is_required && group.selection_type === "single" && options[0]) {
          initial.set(group.id, new Set([options[0].id]));
        }
      }
      setPicks(initial);
    });
  }, [open, product]);

  if (!product) return null;

  const totalDelta = data
    ? data.groups.reduce((sum, { group, options }) => {
        const sel = picks.get(group.id);
        if (!sel) return sum;
        return (
          sum +
          options
            .filter((o) => sel.has(o.id))
            .reduce((s, o) => s + Number(o.price), 0)
        );
      }, 0)
    : 0;

  const requiredMissing =
    data?.groups.filter(
      (g) =>
        g.group.is_required &&
        (!picks.get(g.group.id) || picks.get(g.group.id)!.size === 0),
    ) ?? [];

  function togglePick(groupId: number, optionId: number, isSingle: boolean) {
    setPicks((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(groupId) ?? []);
      if (isSingle) {
        next.set(groupId, new Set([optionId]));
      } else {
        if (cur.has(optionId)) cur.delete(optionId);
        else cur.add(optionId);
        next.set(groupId, cur);
      }
      return next;
    });
  }

  function handleConfirm() {
    if (!data) return;
    if (requiredMissing.length > 0) return;
    const selected: SelectedOption[] = [];
    for (const { group, options } of data.groups) {
      const sel = picks.get(group.id);
      if (!sel) continue;
      for (const opt of options) {
        if (sel.has(opt.id)) {
          selected.push({
            group_id: group.id,
            group_name: group.display_name ?? group.name,
            option_id: opt.id,
            option_name: opt.name,
            price: Number(opt.price),
          });
        }
      }
    }
    onConfirm(selected);
  }

  const totalPrice = Number(product.price) + totalDelta;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>
            Pick your options. Required groups are marked.
          </DialogDescription>
        </DialogHeader>

        {pending && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading options…
          </div>
        )}

        {!pending && data && data.groups.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No modifiers configured for this product. You can add it as-is.
          </p>
        )}

        {!pending && data && data.groups.length > 0 && (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
            {data.groups.map(({ group, options }) => {
              const isSingle = group.selection_type === "single";
              const sel = picks.get(group.id) ?? new Set();
              return (
                <section key={group.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">
                      {group.display_name ?? group.name}
                    </h4>
                    <div className="flex items-center gap-2">
                      {group.is_required && (
                        <Badge variant="outline" className="text-[10px]">
                          Required
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {isSingle ? "Pick 1" : "Multiple"}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {options.map((opt) => {
                      const picked = sel.has(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm transition",
                            picked
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40",
                          )}
                        >
                          <input
                            type={isSingle ? "radio" : "checkbox"}
                            name={`group-${group.id}`}
                            checked={picked}
                            onChange={() => togglePick(group.id, opt.id, isSingle)}
                            className="sr-only"
                          />
                          <span
                            className={cn(
                              "h-4 w-4 shrink-0 border-2",
                              isSingle ? "rounded-full" : "rounded-sm",
                              picked
                                ? "border-primary bg-primary"
                                : "border-muted-foreground",
                            )}
                          />
                          <span className="flex-1">{opt.name}</span>
                          {Number(opt.price) > 0 && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              + ₹{Number(opt.price).toFixed(0)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <Separator />

        <DialogFooter className="sm:items-center sm:justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Total:</span>{" "}
            <span className="font-semibold tabular-nums">
              ₹{totalPrice.toFixed(0)}
            </span>
            {totalDelta > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                (+₹{totalDelta.toFixed(0)})
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || requiredMissing.length > 0}
              onClick={handleConfirm}
              title={
                requiredMissing.length > 0
                  ? `Pick from: ${requiredMissing.map((g) => g.group.display_name ?? g.group.name).join(", ")}`
                  : undefined
              }
            >
              Add to cart
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
