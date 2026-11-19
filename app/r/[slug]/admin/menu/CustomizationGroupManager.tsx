"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  Power,
  Settings2,
  Tags,
  Trash2,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import {
  formatGroupRuleSummary,
  normalizeVegStatus,
  parseVariantPrices,
  resolveGroupRules,
  type VegStatus,
} from "@/lib/customizations";
import { cn } from "@/lib/utils";
import type { CustomizationGroup, CustomizationOption, Outlet } from "@/lib/types";
import {
  cloneCustomizationGroupToOutletsAction,
  saveCustomizationGroupAction,
  toggleCustomizationGroupStatusAction,
  toggleCustomizationOptionStatusAction,
} from "./actions";

export type GroupWithOptions = {
  group: CustomizationGroup;
  options: CustomizationOption[];
};

const DIET_OPTIONS: VegStatus[] = ["Veg", "Egg", "Non-Veg"];

function VegBadgeDot({ veg }: { veg: VegStatus }) {
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
        "inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border",
        borderCls,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotCls)} />
    </span>
  );
}

export function CustomizationGroupManager({
  slug,
  groups,
  outlets,
  currentOutletId,
}: {
  slug: string;
  groups: GroupWithOptions[];
  outlets: Outlet[];
  currentOutletId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<GroupWithOptions | null>(null);
  const [creating, setCreating] = useState(false);
  const [cloning, setCloning] = useState<GroupWithOptions | null>(null);

  const otherOutlets = useMemo(
    () => outlets.filter((o) => o.id !== currentOutletId),
    [outlets, currentOutletId],
  );

  // Suggest variant names from single-select groups (e.g. Small, Medium, Large)
  const variantSuggestions = useMemo(() => {
    const names = new Set<string>();
    for (const { group, options } of groups) {
      if (group.selection_type !== "single") continue;
      for (const opt of options) {
        if (opt.name.trim()) names.add(opt.name.trim());
      }
    }
    return [...names].slice(0, 12);
  }, [groups]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {groups.length === 0
            ? "No customization groups yet."
            : `${groups.length} ${groups.length === 1 ? "group" : "groups"}. Click an option pill to toggle stock (86).`}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-3 w-3" /> Add group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="No customization groups yet"
          description="Create reusable add-on sets like “Choose a size” or “Extra toppings”, then attach them to products from the product editor."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3 w-3" /> Add group
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="pl-3">Group &amp; Rules</TableHead>
                <TableHead>Options (Click to 86 / Restock)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 pr-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(({ group, options }) => {
                const rules = resolveGroupRules(group);
                return (
                  <TableRow key={group.id} className="align-top">
                    <TableCell className="pl-3 font-medium">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{group.display_name}</span>
                          {rules.required && (
                            <Badge variant="outline" className="text-[11px]">
                              Required
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {formatGroupRuleSummary(rules)}
                          </Badge>
                          {rules.freeSelections > 0 && (
                            <Badge
                              variant="outline"
                              className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
                            >
                              First {rules.freeSelections} free
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {options.map((opt) => {
                          const isOut = opt.status !== "active";
                          const veg = normalizeVegStatus(opt.veg_status);
                          const hasVariantPricing =
                            Object.keys(parseVariantPrices(opt.variant_prices))
                              .length > 0;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                start(async () => {
                                  const res =
                                    await toggleCustomizationOptionStatusAction(
                                      slug,
                                      opt.id,
                                    );
                                  if (!res.ok) alert(res.error);
                                  else router.refresh();
                                })
                              }
                              title={
                                isOut
                                  ? `${opt.name} is Sold out — click to mark in stock`
                                  : `Click to mark ${opt.name} sold out`
                              }
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition",
                                isOut
                                  ? "border-border/60 bg-muted/40 text-muted-foreground line-through opacity-70 hover:opacity-100"
                                  : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-muted/40",
                              )}
                            >
                              <VegBadgeDot veg={veg} />
                              <span className="font-medium">{opt.name}</span>
                              {Number(opt.price) > 0 && (
                                <span className="tabular-nums text-muted-foreground">
                                  +₹{Number(opt.price).toFixed(0)}
                                </span>
                              )}
                              {opt.is_default && (
                                <span className="rounded bg-primary/10 px-1 text-[9px] font-semibold text-primary">
                                  Default
                                </span>
                              )}
                              {(opt.max_qty ?? 1) > 1 && (
                                <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
                                  ×{opt.max_qty}
                                </span>
                              )}
                              {hasVariantPricing && (
                                <span
                                  className="rounded bg-amber-500/10 px-1 text-[9px] font-medium text-amber-700"
                                  title="Has variant-specific pricing"
                                >
                                  Var ₹
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={group.status === "active" ? "default" : "outline"}
                      >
                        {group.status === "active" ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={pending}
                          onClick={() => setEditing({ group, options })}
                          title="Edit group & options"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {otherOutlets.length > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={pending}
                            onClick={() => setCloning({ group, options })}
                            title="Copy to other outlets"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const res = await toggleCustomizationGroupStatusAction(
                                slug,
                                group.id,
                              );
                              if (!res.ok) alert(res.error);
                              else router.refresh();
                            })
                          }
                          title={group.status === "active" ? "Disable" : "Enable"}
                        >
                          <Power className="h-3.5 w-3.5" />
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

      <GroupDialog
        slug={slug}
        open={creating}
        onOpenChange={setCreating}
        existing={null}
        variantSuggestions={variantSuggestions}
        onDone={() => {
          setCreating(false);
          router.refresh();
        }}
        pending={pending}
        start={start}
      />
      <GroupDialog
        slug={slug}
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        existing={editing}
        variantSuggestions={variantSuggestions}
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
        pending={pending}
        start={start}
      />
      <CloneGroupDialog
        slug={slug}
        source={cloning}
        otherOutlets={otherOutlets}
        onOpenChange={(o) => {
          if (!o) setCloning(null);
        }}
        onDone={() => {
          setCloning(null);
          router.refresh();
        }}
        pending={pending}
        start={start}
      />
    </div>
  );
}

type VariantPriceRow = { key: string; price: string };

type OptionRow = {
  id: string | null;
  name: string;
  price: string;
  veg_status: VegStatus;
  is_default: boolean;
  max_qty: string;
  status: "active" | "inactive";
  variant_prices: VariantPriceRow[];
  variantsOpen: boolean;
};

function makeEmptyOption(): OptionRow {
  return {
    id: null,
    name: "",
    price: "0",
    veg_status: "Veg",
    is_default: false,
    max_qty: "1",
    status: "active",
    variant_prices: [],
    variantsOpen: false,
  };
}

function mapExistingOptions(options: CustomizationOption[]): OptionRow[] {
  if (options.length === 0) return [makeEmptyOption()];
  return options.map((o) => {
    const vp = parseVariantPrices(o.variant_prices);
    const entries = Object.entries(vp).map(([key, price]) => ({
      key,
      price: String(price),
    }));
    return {
      id: o.id,
      name: o.name,
      price: String(o.price),
      veg_status: normalizeVegStatus(o.veg_status),
      is_default: Boolean(o.is_default),
      max_qty: String(o.max_qty ?? 1),
      status: o.status === "inactive" ? "inactive" : "active",
      variant_prices: entries,
      variantsOpen: entries.length > 0,
    };
  });
}

function GroupDialog({
  slug,
  open,
  onOpenChange,
  existing,
  variantSuggestions,
  onDone,
  pending,
  start,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: GroupWithOptions | null;
  variantSuggestions: string[];
  onDone: () => void;
  pending: boolean;
  start: React.TransitionStartFunction;
}) {
  const [selectionType, setSelectionType] = useState<string>(
    existing?.group.selection_type ?? "single",
  );
  const [isRequired, setIsRequired] = useState<boolean>(
    existing?.group.is_required ?? false,
  );
  const [minSelections, setMinSelections] = useState<string>(
    String(existing?.group.min_selections ?? 1),
  );
  const [maxSelections, setMaxSelections] = useState<string>(
    existing?.group.max_selections != null
      ? String(existing.group.max_selections)
      : "",
  );
  const [freeSelections, setFreeSelections] = useState<string>(
    String(existing?.group.free_selections ?? 0),
  );
  const [rows, setRows] = useState<OptionRow[]>(
    existing ? mapExistingOptions(existing.options) : [makeEmptyOption()],
  );
  const [err, setErr] = useState<string | null>(null);

  // Re-seed local state when the dialog opens for a different group.
  const [seedKey, setSeedKey] = useState<string | null>(null);
  const currentKey = existing?.group.id ?? "";
  if (open && seedKey !== currentKey) {
    setSeedKey(currentKey);
    const selType = existing?.group.selection_type ?? "single";
    const req = Boolean(
      existing?.group.is_required || (existing?.group.min_selections ?? 0) > 0,
    );
    setSelectionType(selType);
    setIsRequired(req);
    setMinSelections(String(existing?.group.min_selections ?? (req ? 1 : 0)));
    setMaxSelections(
      existing?.group.max_selections != null
        ? String(existing.group.max_selections)
        : "",
    );
    setFreeSelections(String(existing?.group.free_selections ?? 0));
    setRows(existing ? mapExistingOptions(existing.options) : [makeEmptyOption()]);
  }

  function setRow(i: number, patch: Partial<OptionRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function toggleDefaultRow(index: number, checked: boolean) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx === index) return { ...r, is_default: checked };
        if (selectionType === "single" && checked) return { ...r, is_default: false };
        return r;
      }),
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setErr(null);
          setSeedKey(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit customization group" : "New customization group"}
          </DialogTitle>
          <DialogDescription>
            Configure selection bounds, free allowances, dietary indicators, default picks, and optional variant-specific pricing.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            const options = rows
              .map((r) => {
                const vp: Record<string, number> = {};
                for (const pair of r.variant_prices) {
                  const k = pair.key.trim();
                  const p = Number(pair.price);
                  if (k && Number.isFinite(p) && p >= 0) vp[k] = p;
                }
                return {
                  id: r.id,
                  name: r.name.trim(),
                  price: Number(r.price),
                  veg_status: r.veg_status,
                  is_default: r.is_default,
                  max_qty: Math.min(20, Math.max(1, Math.floor(Number(r.max_qty) || 1))),
                  variant_prices: vp,
                  status: r.status,
                };
              })
              .filter((r) => r.name);

            if (options.length === 0) {
              setErr("Add at least one option with a name.");
              return;
            }
            fd.set("selection_type", selectionType);
            fd.set("is_required", isRequired ? "true" : "false");
            fd.set("min_selections", minSelections || "0");
            fd.set("max_selections", maxSelections.trim());
            fd.set("free_selections", freeSelections || "0");
            fd.set("options", JSON.stringify(options));
            if (existing) fd.set("id", String(existing.group.id));
            setErr(null);
            start(async () => {
              const res = await saveCustomizationGroupAction(slug, fd);
              if (res.ok) onDone();
              else setErr(res.error);
            });
          }}
          className="grid gap-3.5"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="grp-name">Group name</Label>
            <Input
              id="grp-name"
              name="display_name"
              required
              defaultValue={existing?.group.display_name}
              placeholder="e.g. Choose Crust / Extra Toppings / Curries"
              autoFocus={!existing}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Selection mode</Label>
              <Select
                value={selectionType}
                onValueChange={(v) => {
                  if (!v) return;
                  setSelectionType(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Pick one (Variant / Choice)</SelectItem>
                  <SelectItem value="multi">Pick multiple (Toppings / Combo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="grp-required">Requirement</Label>
              <label
                htmlFor="grp-required"
                className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm"
              >
                <input
                  id="grp-required"
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsRequired(checked);
                    if (checked && Number(minSelections) < 1) {
                      setMinSelections("1");
                    } else if (!checked) {
                      setMinSelections("0");
                    }
                  }}
                  className="h-4 w-4 accent-primary"
                />
                Customer must choose
              </label>
            </div>
          </div>

          {selectionType === "multi" && (
            <div className="grid gap-3 rounded-lg border border-border/80 bg-muted/25 p-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label htmlFor="grp-min" className="text-xs">
                  Min selections
                </Label>
                <Input
                  id="grp-min"
                  type="number"
                  min="0"
                  max="20"
                  disabled={!isRequired}
                  value={isRequired ? minSelections : "0"}
                  onChange={(e) => setMinSelections(e.target.value)}
                  className="h-8 text-xs tabular-nums"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="grp-max" className="text-xs">
                  Max selections
                </Label>
                <Input
                  id="grp-max"
                  type="number"
                  min="1"
                  max="20"
                  placeholder="Unlimited"
                  value={maxSelections}
                  onChange={(e) => setMaxSelections(e.target.value)}
                  className="h-8 text-xs tabular-nums"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="grp-free" className="text-xs">
                  Included free picks
                </Label>
                <Input
                  id="grp-free"
                  type="number"
                  min="0"
                  max="20"
                  value={freeSelections}
                  onChange={(e) => setFreeSelections(e.target.value)}
                  className="h-8 text-xs tabular-nums"
                />
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Options</Label>
            <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <div
                  key={row.id ?? `new-${i}`}
                  className="space-y-2 rounded-lg border border-border/80 bg-background p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={row.veg_status}
                      onValueChange={(v) =>
                        v && setRow(i, { veg_status: normalizeVegStatus(v) })
                      }
                    >
                      <SelectTrigger size="sm" className="w-[96px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIET_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      value={row.name}
                      onChange={(e) => setRow(i, { name: e.target.value })}
                      placeholder="Option name (e.g. Extra Cheese)"
                      className="h-8 min-w-[140px] flex-1 text-xs"
                    />

                    <div className="relative w-24">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        +₹
                      </span>
                      <Input
                        value={row.price}
                        onChange={(e) => setRow(i, { price: e.target.value })}
                        type="number"
                        step="0.01"
                        min="0"
                        className="h-8 pl-7 text-xs tabular-nums"
                      />
                    </div>

                    {selectionType === "multi" && (
                      <div className="flex items-center gap-1" title="Max qty per item">
                        <span className="text-[11px] text-muted-foreground">Max×</span>
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={row.max_qty}
                          onChange={(e) => setRow(i, { max_qty: e.target.value })}
                          className="h-8 w-14 text-xs tabular-nums"
                        />
                      </div>
                    )}

                    <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={row.is_default}
                        onChange={(e) => toggleDefaultRow(i, e.target.checked)}
                        className="h-3 w-3 accent-primary"
                      />
                      Default
                    </label>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={rows.length === 1}
                      onClick={() =>
                        setRows((p) => p.filter((_, idx) => idx !== i))
                      }
                      title="Remove option"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Optional variant/size price overrides */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pl-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setRow(i, { variantsOpen: !row.variantsOpen })
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      {row.variantsOpen ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <Tags className="h-3 w-3" />
                      Variant prices
                      {row.variant_prices.length > 0 && (
                        <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                          {row.variant_prices.length}
                        </Badge>
                      )}
                    </button>

                    {row.status === "inactive" && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700"
                      >
                        Currently 86&apos;d (Sold out)
                      </Badge>
                    )}
                  </div>

                  {row.variantsOpen && (
                    <div className="space-y-1.5 rounded-md border border-dashed border-border bg-muted/20 p-2">
                      {variantSuggestions.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">
                            Quick add variant:
                          </span>
                          {variantSuggestions.map((name) => {
                            const already = row.variant_prices.some(
                              (vp) => vp.key.toLowerCase() === name.toLowerCase(),
                            );
                            if (already) return null;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() =>
                                  setRow(i, {
                                    variant_prices: [
                                      ...row.variant_prices,
                                      { key: name, price: row.price || "0" },
                                    ],
                                  })
                                }
                                className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium hover:border-primary/50"
                              >
                                + {name}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {row.variant_prices.map((vp, vIdx) => (
                        <div key={vIdx} className="flex items-center gap-2">
                          <Input
                            value={vp.key}
                            onChange={(e) => {
                              const next = row.variant_prices.map((item, j) =>
                                j === vIdx ? { ...item, key: e.target.value } : item,
                              );
                              setRow(i, { variant_prices: next });
                            }}
                            placeholder="Variant name (e.g. Large)"
                            className="h-7 flex-1 text-xs"
                          />
                          <div className="relative w-24">
                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                              ₹
                            </span>
                            <Input
                              value={vp.price}
                              type="number"
                              min="0"
                              step="0.01"
                              onChange={(e) => {
                                const next = row.variant_prices.map((item, j) =>
                                  j === vIdx
                                    ? { ...item, price: e.target.value }
                                    : item,
                                );
                                setRow(i, { variant_prices: next });
                              }}
                              className="h-7 pl-6 text-xs tabular-nums"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() =>
                              setRow(i, {
                                variant_prices: row.variant_prices.filter(
                                  (_, j) => j !== vIdx,
                                ),
                              })
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}

                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          setRow(i, {
                            variant_prices: [
                              ...row.variant_prices,
                              { key: "", price: row.price || "0" },
                            ],
                          })
                        }
                      >
                        <Plus className="mr-1 h-3 w-3" /> Add variant price
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 justify-self-start"
              onClick={() => setRows((p) => [...p, makeEmptyOption()])}
            >
              <Plus className="mr-1 h-3 w-3" /> Add option
            </Button>
          </div>

          {err && (
            <p className="text-sm text-destructive" role="alert">
              {err}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : existing ? "Save changes" : "Add group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloneGroupDialog({
  slug,
  source,
  otherOutlets,
  onOpenChange,
  onDone,
  pending,
  start,
}: {
  slug: string;
  source: GroupWithOptions | null;
  otherOutlets: Outlet[];
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
  pending: boolean;
  start: React.TransitionStartFunction;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [seedId, setSeedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (source && seedId !== source.group.id) {
    setSeedId(source.group.id);
    setSelectedIds(new Set(otherOutlets.map((o) => o.id)));
    setErr(null);
  }

  return (
    <Dialog
      open={source !== null}
      onOpenChange={(o) => {
        if (!o) {
          setSeedId(null);
          setErr(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copy &ldquo;{source?.group.display_name}&rdquo;</DialogTitle>
          <DialogDescription>
            Sync this customization group and its {source?.options.length ?? 0} options to sibling outlets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-1">
          {otherOutlets.map((outlet) => {
            const checked = selectedIds.has(outlet.id);
            return (
              <label
                key={outlet.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(outlet.id)) next.delete(outlet.id);
                      else next.add(outlet.id);
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-primary"
                />
                <span className="font-medium">{outlet.name}</span>
              </label>
            );
          })}
        </div>

        {err && (
          <p className="text-xs text-destructive" role="alert">
            {err}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={pending || !source || selectedIds.size === 0}
            onClick={() => {
              if (!source) return;
              setErr(null);
              start(async () => {
                const res = await cloneCustomizationGroupToOutletsAction(
                  slug,
                  source.group.id,
                  [...selectedIds],
                );
                if (res.ok) onDone();
                else setErr(res.error);
              });
            }}
          >
            {pending ? "Copying…" : "Copy to selected outlets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
