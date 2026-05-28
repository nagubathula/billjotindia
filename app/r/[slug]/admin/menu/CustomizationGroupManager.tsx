"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Power, Settings2, Trash2 } from "lucide-react";
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
import type { CustomizationGroup, CustomizationOption } from "@/lib/types";
import {
  saveCustomizationGroupAction,
  toggleCustomizationGroupStatusAction,
} from "./actions";

export type GroupWithOptions = {
  group: CustomizationGroup;
  options: CustomizationOption[];
};

export function CustomizationGroupManager({
  slug,
  groups,
}: {
  slug: string;
  groups: GroupWithOptions[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<GroupWithOptions | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {groups.length === 0
            ? "No customization groups yet."
            : `${groups.length} ${groups.length === 1 ? "group" : "groups"}.`}
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Selection</TableHead>
              <TableHead>Options</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(({ group, options }) => (
              <TableRow key={group.id}>
                <TableCell className="font-medium">
                  {group.display_name}
                  {group.is_required && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      Required
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {group.selection_type === "multi" ? "Multiple" : "Pick 1"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {options.length}
                </TableCell>
                <TableCell>
                  <Badge variant={group.status === "active" ? "default" : "outline"}>
                    {group.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={pending}
                    onClick={() => setEditing({ group, options })}
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
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
                    <Power className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <GroupDialog
        slug={slug}
        open={creating}
        onOpenChange={setCreating}
        existing={null}
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
        onDone={() => {
          setEditing(null);
          router.refresh();
        }}
        pending={pending}
        start={start}
      />
    </div>
  );
}

type OptionRow = { name: string; price: string };

function GroupDialog({
  slug,
  open,
  onOpenChange,
  existing,
  onDone,
  pending,
  start,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: GroupWithOptions | null;
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
  const [rows, setRows] = useState<OptionRow[]>(
    existing
      ? existing.options.map((o) => ({ name: o.name, price: String(o.price) }))
      : [{ name: "", price: "0" }],
  );
  const [err, setErr] = useState<string | null>(null);

  // Re-seed local state when the dialog opens for a different group.
  const [seedKey, setSeedKey] = useState<number | null>(null);
  const currentKey = existing?.group.id ?? 0;
  if (open && seedKey !== currentKey) {
    setSeedKey(currentKey);
    setSelectionType(existing?.group.selection_type ?? "single");
    setIsRequired(existing?.group.is_required ?? false);
    setRows(
      existing
        ? existing.options.map((o) => ({ name: o.name, price: String(o.price) }))
        : [{ name: "", price: "0" }],
    );
  }

  function setRow(i: number, patch: Partial<OptionRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edit customization group" : "New customization group"}
          </DialogTitle>
          <DialogDescription>
            A reusable set of options (e.g. sizes or toppings). Attach it to
            products from the product editor.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            const options = rows
              .map((r) => ({ name: r.name.trim(), price: Number(r.price) }))
              .filter((r) => r.name);
            if (options.length === 0) {
              setErr("Add at least one option with a name.");
              return;
            }
            fd.set("selection_type", selectionType);
            fd.set("is_required", isRequired ? "true" : "false");
            fd.set("options", JSON.stringify(options));
            if (existing) fd.set("id", String(existing.group.id));
            setErr(null);
            start(async () => {
              const res = await saveCustomizationGroupAction(slug, fd);
              if (res.ok) onDone();
              else setErr(res.error);
            });
          }}
          className="grid gap-3"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="grp-name">Group name</Label>
            <Input
              id="grp-name"
              name="display_name"
              required
              defaultValue={existing?.group.display_name}
              placeholder="Choose a size"
              autoFocus={!existing}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Selection</Label>
              <Select
                value={selectionType}
                onValueChange={(v) => v && setSelectionType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Pick one</SelectItem>
                  <SelectItem value="multi">Pick multiple</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="grp-required">Required</Label>
              <label
                htmlFor="grp-required"
                className="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm"
              >
                <input
                  id="grp-required"
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="h-4 w-4"
                />
                Customer must choose
              </label>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Options</Label>
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    placeholder="Small"
                    className="flex-1"
                  />
                  <div className="relative w-28">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      +₹
                    </span>
                    <Input
                      value={row.price}
                      onChange={(e) => setRow(i, { price: e.target.value })}
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-8 tabular-nums"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    disabled={rows.length === 1}
                    onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}
                    title="Remove option"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 justify-self-start"
              onClick={() => setRows((p) => [...p, { name: "", price: "0" }])}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
