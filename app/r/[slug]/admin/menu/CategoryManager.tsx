"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Power, Tag } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
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
        <p className="text-sm text-muted-foreground">
          {categories.length === 0
            ? "No categories yet."
            : `${categories.length} ${categories.length === 1 ? "category" : "categories"}.`}
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-3 w-3" /> Add category
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
                Categories group items on the menu and as POS tabs.
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
                <Label htmlFor="cat-name">Name</Label>
                <Input
                  id="cat-name"
                  name="name"
                  required
                  placeholder="Beverages"
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cat-emoji">Emoji (optional)</Label>
                <Input id="cat-emoji" name="emoji" maxLength={4} placeholder="☕" />
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Sort</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-muted-foreground tabular-nums">
                  {c.sort_order}
                </TableCell>
                <TableCell className="font-medium">
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </TableCell>
                <TableCell>
                  <Badge variant={c.status === "active" ? "default" : "outline"}>
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await toggleCategoryStatusAction(slug, c.id);
                        if (!res.ok) alert(res.error);
                        else router.refresh();
                      })
                    }
                    title={c.status === "active" ? "Disable" : "Enable"}
                  >
                    <Power className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
