"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import { cn } from "@/lib/utils";
import { parseTableName, type OutletInfo, type RawPosTab } from "../TableFloorBoard";

export function QrSheetClient({
  slug,
  restaurantName,
  outlets,
  tabs,
}: {
  slug: string;
  restaurantName: string;
  outlets: OutletInfo[];
  tabs: RawPosTab[];
}) {
  const [selectedOutletId, setSelectedOutletId] = useState(outlets[0]?.id ?? "");
  const [selectedZone, setSelectedZone] = useState("all");
  const [columns, setColumns] = useState<3 | 4>(4);
  const [baseOrigin, setBaseOrigin] = useState("https://billjot.in");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      setBaseOrigin(window.location.origin);
    }
  }, []);

  const outletTabs = useMemo(
    () => tabs.filter((t) => t.outlet_id === selectedOutletId),
    [tabs, selectedOutletId],
  );

  const parsed = useMemo(
    () =>
      outletTabs.map((t) => {
        const { code, zone, seats } = parseTableName(t.name);
        return { id: t.id, code, zone, seats };
      }),
    [outletTabs],
  );

  const zones = useMemo(
    () => Array.from(new Set(parsed.map((p) => p.zone))),
    [parsed],
  );

  const filtered = useMemo(
    () =>
      parsed.filter((p) => selectedZone === "all" || p.zone === selectedZone),
    [parsed, selectedZone],
  );

  const selectedOutlet = outlets.find((o) => o.id === selectedOutletId);

  return (
    <div className="space-y-6">
      {/* Screen-only toolbar */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Link
              href={`/r/${slug}/admin/tables`}
              className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back to Floor
            </Link>
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                Printable Table QR Standees ({filtered.length} Tables)
              </h1>
              <p className="text-xs text-muted-foreground">
                Print A4 sheets or save as PDF for table tents across halls and banquet zones.
              </p>
            </div>
          </div>

          <Button size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print / Save PDF ({filtered.length})
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {outlets.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setSelectedOutletId(o.id);
                  setSelectedZone("all");
                }}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  selectedOutletId === o.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {o.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={baseOrigin}
              onChange={(e) => setBaseOrigin(e.target.value)}
              placeholder="https://yourdomain.com"
              className="h-8 w-56 text-xs"
              title="Domain encoded in QR URLs"
            />
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setColumns(3)}
                className={cn(
                  "rounded px-2 py-1 font-medium",
                  columns === 3
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground",
                )}
              >
                3 Columns (Large)
              </button>
              <button
                type="button"
                onClick={() => setColumns(4)}
                className={cn(
                  "rounded px-2 py-1 font-medium",
                  columns === 4
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground",
                )}
              >
                4 Columns (Compact)
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedZone("all")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              selectedZone === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            All Halls ({parsed.length})
          </button>
          {zones.map((z) => {
            const c = parsed.filter((p) => p.zone === z).length;
            return (
              <button
                key={z}
                type="button"
                onClick={() => setSelectedZone(z)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  selectedZone === z
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {z} ({c})
              </button>
            );
          })}
        </div>
      </div>

      {/* Printable Grid */}
      <div
        className={cn(
          "grid gap-4 print:gap-3",
          columns === 3
            ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4",
        )}
      >
        {filtered.map((t) => {
          const cleanBase = baseOrigin.replace(/\/$/, "");
          const qrUrl = `${cleanBase}/r/${slug}?table=${encodeURIComponent(t.code)}`;
          return (
            <div
              key={t.id}
              className="flex break-inside-avoid flex-col items-center justify-between rounded-xl border border-zinc-300 bg-white p-4 text-center text-zinc-950 shadow-2xs print:shadow-none"
            >
              <div className="w-full border-b border-zinc-200 pb-2">
                <div className="truncate text-xs font-bold tracking-tight uppercase">
                  {restaurantName}
                </div>
                {selectedOutlet?.name && (
                  <div className="truncate text-[10px] text-zinc-500">
                    {selectedOutlet.name}
                  </div>
                )}
              </div>

              <div className="my-3 rounded-lg border border-zinc-200 p-1.5">
                <QrCodeSvg
                  value={qrUrl}
                  size={columns === 3 ? 148 : 120}
                />
              </div>

              <div className="w-full space-y-0.5">
                <div className="text-lg font-extrabold tracking-tight">
                  {t.code}
                </div>
                <div className="text-[11px] font-medium text-zinc-600">
                  {t.zone} · {t.seats} Seats
                </div>
                <div className="pt-1 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                  Scan Camera to Order
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
