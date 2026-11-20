"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChefHat,
  Loader2,
  Pencil,
  Plus,
  Printer as PrinterIcon,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { KitchenStation, Printer, PrinterInterface } from "@/lib/types";
import {
  deleteKitchenStationAction,
  deletePrinterAction,
  saveKitchenStationAction,
  savePrinterAction,
  seedDefaultStationsAction,
} from "./actions";

const PURPOSE_LABEL: Record<string, string> = {
  kot: "Kitchen KOT",
  bill: "Customer Receipt",
  label: "Stickers / Labels",
  customer_display: "Customer Display",
};

const INTERFACE_LABEL: Record<PrinterInterface, string> = {
  network: "LAN / Wi-Fi TCP",
  usb: "USB / WebUSB",
  bluetooth: "Bluetooth",
  cloud: "Cloud Bridge",
};

export function PrintersStationsForm({
  slug,
  outletId,
  outletName,
  initialPrinters,
  initialStations,
}: {
  slug: string;
  outletId: string;
  outletName: string;
  initialPrinters: Printer[];
  initialStations: KitchenStation[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Printer dialog state
  const [printerOpen, setPrinterOpen] = useState(false);
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [printerName, setPrinterName] = useState("");
  const [printerPurpose, setPrinterPurpose] = useState<
    "kot" | "bill" | "label" | "customer_display"
  >("kot");
  const [printerInterface, setPrinterInterface] = useState<PrinterInterface>("network");
  const [printerAddress, setPrinterAddress] = useState("");
  const [printerWidth, setPrinterWidth] = useState<"58" | "80">("80");
  const [printerKickDrawer, setPrinterKickDrawer] = useState(false);

  // Station dialog state
  const [stationOpen, setStationOpen] = useState(false);
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [stationName, setStationName] = useState("");
  const [stationPrinterId, setStationPrinterId] = useState<string>("__none__");
  const [stationSortOrder, setStationSortOrder] = useState("10");

  const printerById = new Map(initialPrinters.map((p) => [p.id, p]));

  function openNewPrinter() {
    setEditingPrinterId(null);
    setPrinterName("");
    setPrinterPurpose("kot");
    setPrinterInterface("network");
    setPrinterAddress("");
    setPrinterWidth("80");
    setPrinterKickDrawer(false);
    setPrinterOpen(true);
  }

  function openEditPrinter(p: Printer) {
    setEditingPrinterId(p.id);
    setPrinterName(p.name);
    setPrinterPurpose(
      p.purpose === "bill" || p.purpose === "label" || p.purpose === "customer_display"
        ? p.purpose
        : "kot",
    );
    setPrinterInterface(
      p.interface === "usb" || p.interface === "bluetooth" || p.interface === "cloud"
        ? p.interface
        : "network",
    );
    setPrinterAddress(p.address ?? "");
    setPrinterWidth(p.paper_width === 58 ? "58" : "80");
    setPrinterKickDrawer(Boolean(p.kick_cash_drawer));
    setPrinterOpen(true);
  }

  function openNewStation() {
    setEditingStationId(null);
    setStationName("");
    setStationPrinterId("__none__");
    setStationSortOrder(String((initialStations.length + 1) * 10));
    setStationOpen(true);
  }

  function openEditStation(s: KitchenStation) {
    setEditingStationId(s.id);
    setStationName(s.name);
    setStationPrinterId(s.printer_id ?? "__none__");
    setStationSortOrder(String(s.sort_order ?? 10));
    setStationOpen(true);
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            msg.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Thermal Printers */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PrinterIcon className="h-4 w-4 text-primary" />
              Thermal Printers ({outletName})
            </CardTitle>
            <CardDescription>
              Configure receipt printers (with RJ11 cash drawer kick) and kitchen station KOT printers.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNewPrinter}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add printer
          </Button>
        </CardHeader>
        <CardContent className="pt-3">
          {initialPrinters.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No printers added yet. Add a USB/LAN thermal printer or configure terminal WebUSB printing directly in POS.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="pl-3">Name</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Interface &amp; Target</TableHead>
                    <TableHead>Paper</TableHead>
                    <TableHead>Cash Drawer</TableHead>
                    <TableHead className="w-24 pr-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialPrinters.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-3 text-xs font-medium">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {PURPOSE_LABEL[p.purpose] ?? p.purpose}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {INTERFACE_LABEL[(p.interface as PrinterInterface) ?? "network"] ?? p.interface}
                        {p.address ? ` · ${p.address}` : ""}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {p.paper_width}mm
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.kick_cash_drawer ? (
                          <Badge variant="secondary" className="text-[10px]">
                            RJ11 Auto-Kick
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="pr-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={pending}
                            onClick={() => openEditPrinter(p)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            disabled={pending}
                            onClick={() => {
                              setMsg(null);
                              start(async () => {
                                const res = await deletePrinterAction(slug, outletId, p.id);
                                if (!res.ok) setMsg({ ok: false, text: res.error });
                                else {
                                  setMsg({ ok: true, text: `Removed printer "${p.name}".` });
                                  router.refresh();
                                }
                              });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kitchen Stations */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-primary" />
              Kitchen Stations ({initialStations.length})
            </CardTitle>
            <CardDescription>
              Split KOT tickets automatically by kitchen prep counter (assign default stations on Categories or override per Product in Menu).
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setMsg(null);
                start(async () => {
                  const res = await seedDefaultStationsAction(slug, outletId);
                  if (!res.ok) setMsg({ ok: false, text: res.error });
                  else {
                    setMsg({ ok: true, text: "Default kitchen stations ready." });
                    router.refresh();
                  }
                });
              }}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Add Default Stations
            </Button>
            <Button size="sm" onClick={openNewStation}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New station
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {initialStations.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No stations configured yet. Click &ldquo;Add Default Stations&rdquo; to create Main Kitchen, Tandoor &amp; Grill, Beverage &amp; Bar, and Desserts.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-20 pl-3">Order</TableHead>
                    <TableHead>Station Name</TableHead>
                    <TableHead>Target KOT Printer</TableHead>
                    <TableHead className="w-24 pr-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialStations.map((s) => {
                    const prn = s.printer_id ? printerById.get(s.printer_id) : null;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="pl-3 text-xs tabular-nums text-muted-foreground">
                          {s.sort_order}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{s.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {prn ? `${prn.name} (${prn.paper_width}mm)` : "KDS Only / Default"}
                        </TableCell>
                        <TableCell className="pr-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={pending}
                              onClick={() => openEditStation(s)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={pending}
                              onClick={() => {
                                setMsg(null);
                                start(async () => {
                                  const res = await deleteKitchenStationAction(
                                    slug,
                                    outletId,
                                    s.id,
                                  );
                                  if (!res.ok) setMsg({ ok: false, text: res.error });
                                  else {
                                    setMsg({ ok: true, text: `Removed station "${s.name}".` });
                                    router.refresh();
                                  }
                                });
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Printer Dialog */}
      <Dialog open={printerOpen} onOpenChange={setPrinterOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPrinterId ? "Edit Printer" : "Add Thermal Printer"}</DialogTitle>
            <DialogDescription>
              Used for station KOT routing and RJ11 cash drawer pulse triggers.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              start(async () => {
                const res = await savePrinterAction(slug, outletId, {
                  id: editingPrinterId ?? undefined,
                  name: printerName,
                  purpose: printerPurpose,
                  interfaceType: printerInterface,
                  address: printerAddress,
                  paperWidth: printerWidth === "58" ? 58 : 80,
                  kickCashDrawer: printerKickDrawer,
                });
                if (!res.ok) {
                  setMsg({ ok: false, text: res.error });
                } else {
                  setPrinterOpen(false);
                  setMsg({ ok: true, text: `Saved printer "${printerName}".` });
                  router.refresh();
                }
              });
            }}
            className="grid gap-3"
          >
            <div className="grid gap-1.5">
              <Label className="text-xs">Printer Name</Label>
              <Input
                value={printerName}
                onChange={(e) => setPrinterName(e.target.value)}
                placeholder="e.g. Counter 80mm Receipt or Tandoor KOT"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Purpose</Label>
                <Select
                  value={printerPurpose}
                  onValueChange={(v) =>
                    v &&
                    setPrinterPurpose(v as "kot" | "bill" | "label" | "customer_display")
                  }
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue>{PURPOSE_LABEL[printerPurpose] ?? printerPurpose}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kot">Kitchen KOT</SelectItem>
                    <SelectItem value="bill">Customer Receipt</SelectItem>
                    <SelectItem value="label">Stickers / Labels</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Connection</Label>
                <Select
                  value={printerInterface}
                  onValueChange={(v) => v && setPrinterInterface(v as PrinterInterface)}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue>{INTERFACE_LABEL[printerInterface]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="network">LAN / Wi-Fi TCP</SelectItem>
                    <SelectItem value="usb">USB / WebUSB</SelectItem>
                    <SelectItem value="bluetooth">Bluetooth</SelectItem>
                    <SelectItem value="cloud">Cloud Bridge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">IP / Bridge Target (Optional)</Label>
                <Input
                  value={printerAddress}
                  onChange={(e) => setPrinterAddress(e.target.value)}
                  placeholder="192.168.1.50:9100"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Paper Roll Width</Label>
                <Select
                  value={printerWidth}
                  onValueChange={(v) => v && setPrinterWidth(v === "58" ? "58" : "80")}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue>{printerWidth}mm</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80">80mm (Standard)</SelectItem>
                    <SelectItem value="58">58mm (Compact)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div>
                <div className="text-xs font-medium">Kick RJ11 Cash Drawer</div>
                <div className="text-[11px] text-muted-foreground">
                  Embed drawer kick pulse on cash receipts
                </div>
              </div>
              <Switch
                checked={printerKickDrawer}
                onCheckedChange={setPrinterKickDrawer}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPrinterOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save Printer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Kitchen Station Dialog */}
      <Dialog open={stationOpen} onOpenChange={setStationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStationId ? "Edit Kitchen Station" : "New Kitchen Station"}</DialogTitle>
            <DialogDescription>
              Route menu categories or individual dishes here so KDS and KOT slips stay organized.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setMsg(null);
              start(async () => {
                const res = await saveKitchenStationAction(slug, outletId, {
                  id: editingStationId ?? undefined,
                  name: stationName,
                  printerId: stationPrinterId === "__none__" ? null : stationPrinterId,
                  sortOrder: Number(stationSortOrder) || 10,
                });
                if (!res.ok) {
                  setMsg({ ok: false, text: res.error });
                } else {
                  setStationOpen(false);
                  setMsg({ ok: true, text: `Saved station "${stationName}".` });
                  router.refresh();
                }
              });
            }}
            className="grid gap-3"
          >
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Station Name</Label>
                <Input
                  value={stationName}
                  onChange={(e) => setStationName(e.target.value)}
                  placeholder="e.g. Tandoor & Grill"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={stationSortOrder}
                  onChange={(e) => setStationSortOrder(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Linked KOT Printer</Label>
              <Select
                value={stationPrinterId}
                onValueChange={(v) => v && setStationPrinterId(v)}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue>
                    {(v: string) =>
                      v === "__none__"
                        ? "KDS Only (No dedicated printer)"
                        : (printerById.get(v)?.name ?? "Select printer")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">KDS Only (No dedicated printer)</SelectItem>
                  {initialPrinters.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.paper_width}mm)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStationOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save Station
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
