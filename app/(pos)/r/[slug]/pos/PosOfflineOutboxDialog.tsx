"use client";

import { useState } from "react";
import {
  CloudOff,
  Loader2,
  Printer,
  RefreshCw,
  Trash2,
  Wifi,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OfflineQueuedOrder } from "@/lib/pos-offline";
import type { Outlet } from "@/lib/types";

export function PosOfflineOutboxDialog({
  open,
  onOpenChange,
  isOnline,
  syncing,
  outlet,
  queue,
  previewOrder,
  onSelectPreview,
  onSyncNow,
  onRemoveOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOnline: boolean;
  syncing: boolean;
  outlet: Outlet;
  queue: OfflineQueuedOrder[];
  previewOrder: OfflineQueuedOrder | null;
  onSelectPreview: (order: OfflineQueuedOrder | null) => void;
  onSyncNow: () => void;
  onRemoveOrder: (offlineId: string) => void;
}) {
  const [printingId, setPrintingId] = useState<string | null>(null);

  function printPreviewReceipt() {
    if (!previewOrder) return;
    setPrintingId(previewOrder.offlineId);
    setTimeout(() => {
      window.print();
      setPrintingId(null);
    }, 50);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              {isOnline ? (
                <Wifi className="h-4 w-4 text-emerald-600" />
              ) : (
                <CloudOff className="h-4 w-4 text-amber-600" />
              )}
              Offline Billing Outbox ({queue.length})
            </span>
            <Badge variant={isOnline ? "secondary" : "destructive"} className="text-[11px]">
              {isOnline ? "Online · Ready to sync" : "Offline · Queued locally"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            Bills punched while internet drops are saved safely in IndexedDB with idempotent offline IDs and synced automatically when online.
          </DialogDescription>
        </DialogHeader>

        {previewOrder ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between print:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onSelectPreview(null)}
              >
                ← Back to Outbox List
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={printingId !== null}
                onClick={printPreviewReceipt}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print Offline 80mm Receipt
              </Button>
            </div>

            <div className="mx-auto w-[80mm] rounded-lg border border-border bg-white p-3 font-mono text-[11px] leading-snug text-black shadow-sm print:border-0 print:shadow-none">
              <div className="text-center">
                <div className="text-sm font-bold uppercase">{outlet.name}</div>
                {outlet.address && <div className="text-[10px]">{outlet.address}</div>}
                {outlet.gstin && <div className="text-[10px]">GSTIN: {outlet.gstin}</div>}
              </div>
              <hr className="my-2 border-dashed border-black" />
              <div className="flex justify-between font-semibold">
                <span>Bill #{previewOrder.billNumber}</span>
                <span className="uppercase">{previewOrder.paymentMode}</span>
              </div>
              <div className="text-[10px]">
                {new Date(previewOrder.createdAt).toLocaleString("en-IN")} ·{" "}
                {previewOrder.orderType.toUpperCase()}
              </div>
              {previewOrder.customerName && previewOrder.customerName !== "Walk-in" && (
                <div className="text-[10px]">Guest: {previewOrder.customerName}</div>
              )}
              <hr className="my-2 border-dashed border-black" />
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dashed border-black">
                    <th className="text-left font-normal">Item</th>
                    <th className="text-right font-normal">Qty</th>
                    <th className="text-right font-normal">₹</th>
                  </tr>
                </thead>
                <tbody>
                  {previewOrder.items.map((it, i) => (
                    <tr key={i} className="align-top">
                      <td className="py-0.5 pr-1">
                        <div>{it.product_config.name}</div>
                        {it.instructions && (
                          <div className="text-[9px] italic">* {it.instructions}</div>
                        )}
                      </td>
                      <td className="py-0.5 text-right tabular-nums">{it.quantity}</td>
                      <td className="py-0.5 text-right tabular-nums">
                        {it.total_price.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <hr className="my-2 border-dashed border-black" />
              <div className="flex justify-between">
                <span>Taxable</span>
                <span>₹{previewOrder.subtotalTaxable.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>CGST + SGST</span>
                <span>
                  ₹{(previewOrder.cgstAmount + previewOrder.sgstAmount).toFixed(2)}
                </span>
              </div>
              {previewOrder.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-₹{previewOrder.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-dashed border-black pt-1 text-xs font-bold">
                <span>TOTAL</span>
                <span>₹{previewOrder.totalAmount.toFixed(2)}</span>
              </div>
              <div className="mt-2 text-center text-[9px] uppercase">
                Offline Counter Receipt · Sync Pending
              </div>
            </div>
          </div>
        ) : queue.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            All offline POS bills are synced with the cloud. Zero pending bills in outbox.
          </div>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {queue.map((item) => (
              <div
                key={item.offlineId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="font-mono font-bold">{item.billNumber}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {item.paymentMode}
                    </Badge>
                    <Badge
                      variant={
                        item.syncStatus === "failed" ? "destructive" : "secondary"
                      }
                      className="text-[10px] uppercase"
                    >
                      {item.syncStatus}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("en-IN")} · {item.customerName} ·{" "}
                    {item.items.reduce((s, l) => s + l.quantity, 0)} items
                  </div>
                  {item.lastError && (
                    <div className="text-[11px] text-destructive">
                      Sync note: {item.lastError}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    ₹{item.totalAmount.toFixed(0)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => onSelectPreview(item)}
                  >
                    <Printer className="mr-1 h-3 w-3" />
                    Receipt
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={syncing}
                    title="Discard offline entry"
                    onClick={() => onRemoveOrder(item.offlineId)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="print:hidden">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            disabled={!isOnline || syncing || queue.length === 0}
            onClick={onSyncNow}
          >
            {syncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {syncing ? "Syncing Outbox…" : `Sync All Now (${queue.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
