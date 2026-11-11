"use client";

// Reject a new order or cancel an accepted one — always with a reason. Used by
// the order page and the kitchen board.

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CANCEL_NOTE_MAX,
  CANCEL_REASONS,
  type CancelReasonCode,
} from "@/lib/order-cancel";
import { cancelOrderAction } from "@/app/r/[slug]/admin/orders/[id]/actions";

export type CancelOrderLine = {
  productId: string | null;
  name: string;
};

type Props = {
  slug: string;
  orderId: string;
  orderLabel: string;
  lines: CancelOrderLine[];
  /** "reject" before the order is accepted, "cancel" after. Wording only. */
  verb: "reject" | "cancel";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
};

export function CancelOrderDialog({
  slug,
  orderId,
  orderLabel,
  lines,
  verb,
  open,
  onOpenChange,
  onDone,
}: Props) {
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [markOutOfStock, setMarkOutOfStock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // One row per product, even if it's on the order twice with different add-ons.
  const products = useMemo(() => {
    const byId = new Map<string, string>();
    for (const l of lines) {
      if (l.productId && !byId.has(l.productId)) byId.set(l.productId, l.name);
    }
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [lines]);

  // Start clean every time the dialog opens — and only then. `products` is
  // rebuilt whenever the parent re-renders (the kitchen board refreshes every
  // 15s), which must not wipe a half-filled form.
  useEffect(() => {
    if (!open) return;
    setReason(null);
    setNote("");
    setPicked(new Set(products.length === 1 ? [products[0].id] : []));
    setMarkOutOfStock(true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const isStockOut = reason === "item_out_of_stock";
  const needsItem = isStockOut && products.length > 0;
  const valid =
    reason !== null &&
    (reason !== "other" || note.trim().length > 0) &&
    (!needsItem || picked.size > 0);

  const action = verb === "reject" ? "Reject order" : "Cancel order";

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!reason || !valid) return;
    setError(null);
    start(async () => {
      const res = await cancelOrderAction(slug, orderId, {
        reason,
        note,
        productIds: isStockOut ? Array.from(picked) : [],
        markOutOfStock: isStockOut && markOutOfStock,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOpenChange(false);
      onDone?.();
      // No toast provider is mounted in the app; match the other order actions.
      if (res.warning) alert(res.warning);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action} {orderLabel}
          </DialogTitle>
          <DialogDescription>
            Choose why. The reason is saved with the order.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-1.5" disabled={pending}>
          <legend className="sr-only">Reason</legend>
          {CANCEL_REASONS.map((r) => (
            <label
              key={r.code}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition",
                reason === r.code
                  ? "border-primary bg-primary/5 font-medium"
                  : "border-border hover:bg-muted/60",
              )}
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r.code}
                checked={reason === r.code}
                onChange={() => setReason(r.code)}
                className="h-4 w-4 accent-primary"
              />
              {r.label}
            </label>
          ))}
        </fieldset>

        {needsItem && (
          <fieldset className="grid gap-2 rounded-lg bg-muted/50 p-3" disabled={pending}>
            <legend className="sr-only">Out-of-stock items</legend>
            <p className="text-xs font-medium text-muted-foreground">
              Which item is out of stock?
            </p>
            {products.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="h-4 w-4 accent-primary"
                />
                {p.name}
              </label>
            ))}
            <label className="mt-1 flex cursor-pointer items-start gap-2 border-t border-border pt-2 text-sm">
              <input
                type="checkbox"
                checked={markOutOfStock}
                onChange={(e) => setMarkOutOfStock(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary"
              />
              <span>
                Take it off the menu
                <span className="block text-xs text-muted-foreground">
                  Stays off until you switch it back on under Menu.
                </span>
              </span>
            </label>
          </fieldset>
        )}

        {reason !== null && (
          <div className="grid gap-1.5">
            <label htmlFor="cancel-note" className="text-xs font-medium text-muted-foreground">
              {reason === "other" ? "What happened?" : "Note (optional)"}
            </label>
            <textarea
              id="cancel-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={CANCEL_NOTE_MAX}
              rows={2}
              disabled={pending}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Keep order
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!valid || pending}>
            {pending ? "Saving…" : action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
