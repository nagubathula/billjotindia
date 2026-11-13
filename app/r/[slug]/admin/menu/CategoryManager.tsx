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
import type { Category } from "@/lib/types";
import {
  createCategoryAction,
  toggleCategoryStatusAction,
} from "./actions";

export function CategoryManager({
  slug,
  categories,
}: {
  slug: string;
  categories: Category[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
                setErr(null);
                start(async () => {
                  const res = await createCategoryAction(slug, fd);
                  if (res.ok) {
                    setOpen(false);
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
                <TableHead className="w-36 pr-3 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => {
                const isActive = c.status === "active";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-3 text-xs text-muted-foreground tabular-nums">
                      {c.sort_order}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {c.name}
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
