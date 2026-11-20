"use client";

import { useState } from "react";
import { ChefHat, KeyRound, Loader2, Printer, Usb, Wifi } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  buildEscPosDrawerKickBytes,
  buildEscPosTestSlip,
} from "@/lib/escpos";
import {
  dispatchEscPosBytes,
  isWebUsbSupported,
  pairWebUsbPrinter,
  type PosPrinterTerminalConfig,
  type PosPrinterTransport,
} from "@/lib/pos-printer-client";
import type { KitchenStation } from "@/lib/types";

export function PosPrinterDialog({
  open,
  onOpenChange,
  outletName,
  config,
  onSaveConfig,
  stations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outletName: string;
  config: PosPrinterTerminalConfig;
  onSaveConfig: (next: PosPrinterTerminalConfig) => void;
  stations: KitchenStation[];
}) {
  const [draft, setDraft] = useState<PosPrinterTerminalConfig>(config);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);

  if (open && !prevOpen) {
    setPrevOpen(true);
    setDraft(config);
    setStatus(null);
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  async function handlePairUsb() {
    setBusy(true);
    setStatus(null);
    try {
      const dev = await pairWebUsbPrinter();
      const updated: PosPrinterTerminalConfig = {
        ...draft,
        transport: "webusb",
        usbVendorId: dev.vendorId,
        usbProductId: dev.productId,
        usbProductName: dev.productName,
      };
      setDraft(updated);
      onSaveConfig(updated);
      setStatus({ ok: true, msg: `Paired USB printer: ${dev.productName}` });
    } catch (err) {
      setStatus({
        ok: false,
        msg: err instanceof Error ? err.message : "USB pairing cancelled or failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleTestSlip() {
    setBusy(true);
    setStatus(null);
    try {
      const bytes = buildEscPosTestSlip({
        outletName,
        paperWidth: draft.paperWidth,
        kickDrawer: draft.autoKickCashDrawer,
      });
      const res = await dispatchEscPosBytes(draft, bytes, { jobType: "test" });
      if (!res.ok) setStatus({ ok: false, msg: res.error });
      else setStatus({ ok: true, msg: "Test ESC/POS slip sent cleanly." });
    } finally {
      setBusy(false);
    }
  }

  async function handleKickDrawer() {
    setBusy(true);
    setStatus(null);
    try {
      const bytes = buildEscPosDrawerKickBytes();
      const res = await dispatchEscPosBytes(draft, bytes, { jobType: "drawer" });
      if (!res.ok) setStatus({ ok: false, msg: res.error });
      else setStatus({ ok: true, msg: "Cash drawer kick pulse sent (ESC p)." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="h-4 w-4 text-primary" />
            POS Terminal Printer &amp; Cash Drawer
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure silent ESC/POS thermal receipts, multi-station KOT slips, and RJ11 drawer kicks on this register.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Print Transport Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "browser", label: "Browser Print", icon: Printer },
                  { id: "webusb", label: "WebUSB Silent", icon: Usb },
                  { id: "lan_bridge", label: "LAN Agent", icon: Wifi },
                ] as { id: PosPrinterTransport; label: string; icon: React.ComponentType<{ className?: string }> }[]
              ).map((opt) => {
                const Icon = opt.icon;
                const active = draft.transport === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, transport: opt.id }))}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {draft.transport === "webusb" && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs">
                  <div className="font-medium">
                    {draft.usbProductName || "No USB thermal printer paired yet"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {isWebUsbSupported()
                      ? "Direct zero-dialog printing via Chrome WebUSB"
                      : "WebUSB unavailable in this browser; switch to LAN Agent or Chrome."}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || !isWebUsbSupported()}
                  onClick={handlePairUsb}
                >
                  Pair USB
                </Button>
              </div>
            </div>
          )}

          {draft.transport === "lan_bridge" && (
            <div className="grid gap-1.5">
              <Label className="text-xs">Local Print Bridge URL</Label>
              <Input
                value={draft.lanBridgeUrl}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, lanBridgeUrl: e.target.value }))
                }
                placeholder="http://127.0.0.1:9109/print"
                className="h-8 font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Receives JSON <code>{`{ dataBase64, jobType, station, paperWidth }`}</code> to forward raw ESC/POS bytes to LAN/USB/Bluetooth printers.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Thermal Paper Width</Label>
              <div className="flex gap-2">
                {([80, 58] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, paperWidth: w }))}
                    className={`flex-1 rounded-md border py-1.5 text-xs font-medium ${
                      draft.paperWidth === w
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {w}mm
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                disabled={busy || draft.transport === "browser"}
                onClick={handleTestSlip}
              >
                {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Test Print
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={busy || draft.transport === "browser"}
                onClick={handleKickDrawer}
                title="Pulse RJ11 Cash Drawer"
              >
                <KeyRound className="mr-1 h-3.5 w-3.5" />
                Kick Drawer
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">Silent Receipt on Settlement</div>
                <div className="text-[11px] text-muted-foreground">
                  Print thermal receipt without opening a new browser tab when WebUSB/LAN is active
                </div>
              </div>
              <Switch
                checked={draft.silentReceipt}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, silentReceipt: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">Silent Station KOTs on Send KOT</div>
                <div className="text-[11px] text-muted-foreground">
                  Auto-print separate KOT slips per kitchen station
                </div>
              </div>
              <Switch
                checked={draft.silentKot}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, silentKot: v }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium">Auto-Kick RJ11 Cash Drawer</div>
                <div className="text-[11px] text-muted-foreground">
                  Open drawer automatically on Cash &amp; Cash-Split settlements
                </div>
              </div>
              <Switch
                checked={draft.autoKickCashDrawer}
                onCheckedChange={(v) =>
                  setDraft((d) => ({ ...d, autoKickCashDrawer: v }))
                }
              />
            </div>
          </div>

          {stations.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <ChefHat className="h-3.5 w-3.5" />
                Active Kitchen KOT Stations ({outletName})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stations.map((s) => (
                  <Badge key={s.id} variant="secondary" className="text-[11px]">
                    {s.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {status && (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                status.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {status.msg}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            onClick={() => {
              onSaveConfig(draft);
              onOpenChange(false);
            }}
          >
            Save Printer Config
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
