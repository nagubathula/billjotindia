"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, Minus, Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  QUICK_PREP_TAGS,
  collectActiveVariantKeys,
  evaluateProductCustomizations,
  formatGroupRuleSummary,
  normalizeVegStatus,
  resolveGroupRules,
  resolveOptionUnitPrice,
  togglePrepTagInNote,
  type ProductModifiersPayload,
  type VegStatus,
} from "@/lib/customizations";
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
  onConfirm: (selectedOptions: SelectedOption[], instructions?: string) => void;
  /** Optional preloaded modifiers to eliminate network latency on click. */
  preloadedModifiers?: ProductModifiers | null;
  /** Existing selections when editing an already-added cart/POS bill line. */
  initialSelections?: SelectedOption[];
  initialInstructions?: string;
  showInstructions?: boolean;
  confirmLabel?: string;
};

function VegDot({ veg }: { veg: VegStatus }) {
  const borderCls =
    veg === "Veg"
      ? "border-emerald-600"
      : veg === "Egg"
        ? "border-amber-500"
        : "border-rose-600";
  const dotCls =
    veg === "Veg"
      ? "bg-emerald-600"
      : veg === "Egg"
        ? "bg-amber-500"
        : "bg-rose-600";
  return (
    <span
      title={veg}
      aria-label={veg}
      className={cn(
        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[2px] border bg-background",
        borderCls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotCls)} />
    </span>
  );
}

function seedPicks(
  mods: ProductModifiersPayload,
  initialSelections?: SelectedOption[],
): Map<string, Map<string, number>> {
  const initial = new Map<string, Map<string, number>>();

  if (initialSelections && initialSelections.length > 0) {
    const validOpts = new Map<string, { groupId: string; maxQty: number; isSingle: boolean }>();
    for (const entry of mods.groups) {
      const rules = resolveGroupRules(entry.group, entry.is_required_override);
      for (const opt of entry.options) {
        validOpts.set(opt.id, {
          groupId: entry.group.id,
          maxQty: rules.isSingle ? 1 : Math.max(1, Number(opt.max_qty ?? 1)),
          isSingle: rules.isSingle,
        });
      }
    }
    for (const sel of initialSelections) {
      const meta = validOpts.get(sel.option_id);
      if (!meta) continue;
      let grpMap = initial.get(meta.groupId);
      if (!grpMap) {
        grpMap = new Map<string, number>();
        initial.set(meta.groupId, grpMap);
      }
      if (meta.isSingle && grpMap.size >= 1) continue;
      const qty = Math.min(
        meta.maxQty,
        Math.max(1, Math.floor(Number(sel.quantity ?? 1) || 1)),
      );
      grpMap.set(sel.option_id, qty);
    }
    if (initial.size > 0) return initial;
  }

  for (const { group, options, is_required_override } of mods.groups) {
    const rules = resolveGroupRules(group, is_required_override);
    const defaults = options.filter((o) => Boolean(o.is_default));
    if (defaults.length > 0) {
      const grpMap = new Map<string, number>();
      if (rules.isSingle) {
        grpMap.set(defaults[0].id, 1);
      } else {
        const limit = rules.max ?? defaults.length;
        for (const opt of defaults.slice(0, limit)) {
          grpMap.set(opt.id, 1);
        }
      }
      initial.set(group.id, grpMap);
    } else if (rules.required && rules.isSingle && options[0]) {
      initial.set(group.id, new Map([[options[0].id, 1]]));
    }
  }
  return initial;
}

export function ModifierDialog({
  product,
  open,
  onOpenChange,
  onConfirm,
  preloadedModifiers,
  initialSelections,
  initialInstructions = "",
  showInstructions = true,
  confirmLabel = "Add to cart",
}: Props) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<ProductModifiers | null>(null);
  // group_id -> (option_id -> qty)
  const [picks, setPicks] = useState<Map<string, Map<string, number>>>(new Map());
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (!open || !product) {
      setData(null);
      setPicks(new Map());
      setNote("");
      return;
    }

    setNote(initialInstructions ?? "");

    if (preloadedModifiers !== undefined) {
      const resolved = preloadedModifiers ?? { groups: [] };
      setData(resolved);
      setPicks(seedPicks(resolved, initialSelections));
      return;
    }

    let cancelled = false;
    start(async () => {
      const res = await getProductModifiers(product.id);
      if (cancelled) return;
      setData(res);
      setPicks(seedPicks(res, initialSelections));
    });
    return () => {
      cancelled = true;
    };
  }, [open, product, preloadedModifiers, initialSelections, initialInstructions]);

  const rawSelections = useMemo(() => {
    const out: Array<{ option_id: string; quantity: number }> = [];
    for (const grpMap of picks.values()) {
      for (const [optionId, qty] of grpMap.entries()) {
        if (qty > 0) out.push({ option_id: optionId, quantity: qty });
      }
    }
    return out;
  }, [picks]);

  const activeVariantKeys = useMemo(
    () => (data ? collectActiveVariantKeys(data.groups, picks) : new Set<string>()),
    [data, picks],
  );

  const evalResult = useMemo(() => {
    if (!product || !data) {
      return {
        ok: true as const,
        selectedOptions: [],
        optionsTotal: 0,
      };
    }
    return evaluateProductCustomizations(
      product.name,
      data.groups,
      rawSelections,
    );
  }, [product, data, rawSelections]);

  if (!product) return null;

  const isProductVeg = (product.veg_status ?? "Veg").toLowerCase() === "veg";
  const optionsDelta = evalResult.ok ? evalResult.optionsTotal : 0;
  const totalPrice = Number(product.price) + optionsDelta;

  function togglePick(
    groupId: string,
    optionId: string,
    isSingle: boolean,
    maxGroupSelections: number | null,
  ) {
    setPicks((prev) => {
      const next = new Map(prev);
      const cur = new Map(next.get(groupId) ?? []);
      if (isSingle) {
        next.set(groupId, new Map([[optionId, 1]]));
        return next;
      }

      if (cur.has(optionId)) {
        cur.delete(optionId);
      } else {
        let totalInGroup = 0;
        for (const q of cur.values()) totalInGroup += q;
        if (maxGroupSelections !== null && totalInGroup >= maxGroupSelections) {
          return prev;
        }
        cur.set(optionId, 1);
      }
      next.set(groupId, cur);
      return next;
    });
  }

  function adjustOptionQty(
    groupId: string,
    optionId: string,
    delta: -1 | 1,
    maxOptQty: number,
    maxGroupSelections: number | null,
  ) {
    setPicks((prev) => {
      const next = new Map(prev);
      const cur = new Map(next.get(groupId) ?? []);
      const curQty = cur.get(optionId) ?? 0;
      const targetQty = curQty + delta;

      if (targetQty <= 0) {
        cur.delete(optionId);
        next.set(groupId, cur);
        return next;
      }
      if (targetQty > maxOptQty) return prev;

      if (delta > 0 && maxGroupSelections !== null) {
        let totalInGroup = 0;
        for (const q of cur.values()) totalInGroup += q;
        if (totalInGroup + delta > maxGroupSelections) return prev;
      }

      cur.set(optionId, targetQty);
      next.set(groupId, cur);
      return next;
    });
  }

  function handleConfirm() {
    if (!data || !evalResult.ok) return;
    onConfirm(
      evalResult.selectedOptions.map((o) => ({
        group_id: o.group_id,
        group_name: o.group_name,
        option_id: o.option_id,
        option_name: o.option_name,
        price: o.price,
        ...(o.quantity && o.quantity > 1 ? { quantity: o.quantity } : {}),
        ...(o.unit_price !== undefined ? { unit_price: o.unit_price } : {}),
        ...(o.veg_status ? { veg_status: o.veg_status } : {}),
      })),
      note.trim() || undefined,
    );
  }

  const activeTagsSet = new Set(
    note
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <VegDot veg={normalizeVegStatus(product.veg_status)} />
            <span>{product.name}</span>
          </DialogTitle>
          <DialogDescription>
            Customize your item. Required selections are marked below.
          </DialogDescription>
        </DialogHeader>

        {pending && !data && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading options…
          </div>
        )}

        {data && data.groups.length === 0 && !showInstructions && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No modifiers configured for this product. You can add it as-is.
          </p>
        )}

        {data && (
          <div className="max-h-[54vh] space-y-4 overflow-y-auto pr-1">
            {data.groups.map(({ group, options, is_required_override }) => {
              const rules = resolveGroupRules(group, is_required_override);
              const grpSel = picks.get(group.id) ?? new Map<string, number>();
              let groupPickedTotal = 0;
              for (const q of grpSel.values()) groupPickedTotal += q;

              return (
                <section key={group.id} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">
                      {group.display_name ?? group.name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {rules.required && (
                        <Badge variant="outline" className="text-[11px]">
                          Required
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[11px]">
                        {formatGroupRuleSummary(rules)}
                      </Badge>
                      {rules.freeSelections > 0 && (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-700 dark:text-emerald-300"
                        >
                          First {rules.freeSelections} free
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {options.map((opt) => {
                      const qty = grpSel.get(opt.id) ?? 0;
                      const picked = qty > 0;
                      const maxOptQty = rules.isSingle
                        ? 1
                        : Math.max(1, Math.floor(Number(opt.max_qty ?? 1)));
                      const atGroupLimit =
                        !picked &&
                        !rules.isSingle &&
                        rules.max !== null &&
                        groupPickedTotal >= rules.max;
                      const unitPrice = resolveOptionUnitPrice(
                        opt,
                        activeVariantKeys,
                      );
                      const veg = normalizeVegStatus(opt.veg_status);
                      const vegMismatch = isProductVeg && veg !== "Veg";

                      return (
                        <div
                          key={opt.id}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border p-2.5 text-sm transition",
                            picked
                              ? "border-primary bg-primary/5"
                              : atGroupLimit
                                ? "border-border/60 bg-muted/30 opacity-60"
                                : "border-border hover:border-primary/40",
                          )}
                        >
                          <button
                            type="button"
                            disabled={atGroupLimit}
                            onClick={() =>
                              togglePick(
                                group.id,
                                opt.id,
                                rules.isSingle,
                                rules.max,
                              )
                            }
                            aria-pressed={picked}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-not-allowed"
                          >
                            <span
                              className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center border-2",
                                rules.isSingle ? "rounded-full" : "rounded-sm",
                                picked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-muted-foreground",
                              )}
                            >
                              {picked && !rules.isSingle && (
                                <Check className="h-3 w-3 stroke-[3]" />
                              )}
                              {picked && rules.isSingle && (
                                <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                              )}
                            </span>
                            <VegDot veg={veg} />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {opt.name}
                            </span>
                            {vegMismatch && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
                                {veg}
                              </span>
                            )}
                          </button>

                          <div className="flex shrink-0 items-center gap-2">
                            {unitPrice > 0 && (
                              <span className="text-xs tabular-nums text-muted-foreground">
                                + ₹{unitPrice.toFixed(0)}
                              </span>
                            )}

                            {picked && !rules.isSingle && maxOptQty > 1 && (
                              <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-1 py-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    adjustOptionQty(
                                      group.id,
                                      opt.id,
                                      -1,
                                      maxOptQty,
                                      rules.max,
                                    )
                                  }
                                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted"
                                  aria-label={`Decrease ${opt.name}`}
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-4 text-center text-xs font-semibold tabular-nums">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  disabled={
                                    qty >= maxOptQty ||
                                    (rules.max !== null &&
                                      groupPickedTotal >= rules.max)
                                  }
                                  onClick={() =>
                                    adjustOptionQty(
                                      group.id,
                                      opt.id,
                                      1,
                                      maxOptQty,
                                      rules.max,
                                    )
                                  }
                                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted disabled:opacity-40"
                                  aria-label={`Increase ${opt.name}`}
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {showInstructions && (
              <section className="space-y-2 border-t border-border/70 pt-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Kitchen Prep &amp; Note
                  </h4>
                  {note.trim() && (
                    <button
                      type="button"
                      onClick={() => setNote("")}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PREP_TAGS.map((tag) => {
                    const active = activeTagsSet.has(tag.toLowerCase());
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setNote((prev) => togglePrepTagInNote(prev, tag))}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition",
                          active
                            ? "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <Input
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional cooking instruction (e.g. extra crisp)…"
                  className="h-8 text-xs"
                />
              </section>
            )}
          </div>
        )}

        <Separator />

        <DialogFooter className="sm:items-center sm:justify-between">
          <div className="space-y-0.5 text-sm">
            <div>
              <span className="text-muted-foreground">Total:</span>{" "}
              <span className="font-semibold tabular-nums">
                ₹{totalPrice.toFixed(0)}
              </span>
              {optionsDelta > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (+₹{optionsDelta.toFixed(0)})
                </span>
              )}
            </div>
            {!evalResult.ok && (
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                {evalResult.error}
              </p>
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
              disabled={pending || !data || !evalResult.ok}
              onClick={handleConfirm}
              title={!evalResult.ok ? evalResult.error : undefined}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
