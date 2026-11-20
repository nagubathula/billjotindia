"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Tag } from "lucide-react";
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
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import type { Category, KitchenStation } from "@/lib/types";
import {
  createCategoryAction,
  toggleCategoryStatusAction,
  updateCategoryStationAction,
} from "./actions";

export function CategoryManager({
  slug,
  categories,
  stations = [],
}: {
  slug: string;
  categories: Category[];
  stations?: KitchenStation[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [newStationId, setNewStationId] = useState("__none__");
  const [err, setErr] = useState<string | null>(null);
  const stationById = new Map(stations.map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {categories.length === 0
            ? "No categories yet."
            : `${categories.length} ${categories.length === 1 ? "category" : "categories"} configured.`}
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add category
        </Button>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setErr(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New category</DialogTitle>
              <DialogDescription>
                Categories group items on the menu and as POS filter tabs.
              </DialogDescription>
            </DialogHeader>
            <form
              action={(fd) => {
                fd.set("station_id", newStationId);
                setErr(null);
                start(async () => {
                  const res = await createCategoryAction(slug, fd);
                  if (res.ok) {
                    setOpen(false);
                    setNewStationId("__none__");
                    router.refresh();
                  } else {
                    setErr(res.error);
                  }
                });
              }}
              className="grid gap-3"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="cat-name">Category name</Label>
                <Input
                  id="cat-name"
                  name="name"
                  required
                  placeholder="Beverages"
                  autoFocus
                />
              </div>
              {stations.length > 0 && (
                <div className="grid gap-1.5">
                  <Label>Default Kitchen Station</Label>
                  <Select
                    value={newStationId}
                    onValueChange={(v) => v && setNewStationId(v)}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue>
                        {(v: string) =>
                          v === "__none__"
                            ? "General / Unassigned"
                            : (stationById.get(v)?.name ?? "Select station")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">General / Unassigned</SelectItem>
                      {stations.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {err && (
                <p className="text-xs text-destructive" role="alert">
                  {err}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Adding…" : "Add category"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No categories yet"
          description="Add at least one category before you can create products."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-20 pl-3">Order</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="w-52">Default Station</TableHead>
                <TableHead className="w-36 pr-3 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => {
                const isActive = c.status === "active";
                const stationVal = c.station_id ?? "__none__";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-3 text-xs text-muted-foreground tabular-nums">
                      {c.sort_order}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {c.name}
                    </TableCell>
                    <TableCell>
                      {stations.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          No stations configured
                        </span>
                      ) : (
                        <Select
                          value={stationVal}
                          disabled={pending}
                          onValueChange={(v) => {
                            if (!v) return;
                            start(async () => {
                              const res = await updateCategoryStationAction(
                                slug,
                                c.id,
                                v === "__none__" ? null : v,
                              );
                              if (!res.ok) alert(res.error);
                              else router.refresh();
                            });
                          }}
                        >
                          <SelectTrigger size="sm" className="h-7 w-44 text-[11px]">
                            <SelectValue>
                              {(v: string) =>
                                v === "__none__"
                                  ? "General / Unassigned"
                                  : (stationById.get(v)?.name ?? "Station")
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">General / Unassigned</SelectItem>
                            {stations.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="pr-3">
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className={cn(
                            "text-[11px]",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {isActive ? "Active" : "Hidden"}
                        </span>
                        <Switch
                          checked={isActive}
                          disabled={pending}
                          onCheckedChange={() =>
                            start(async () => {
                              const res = await toggleCategoryStatusAction(
                                slug,
                                c.id,
                              );
                              if (!res.ok) alert(res.error);
                              else router.refresh();
                            })
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
