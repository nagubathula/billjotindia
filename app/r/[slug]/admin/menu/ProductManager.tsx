"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Power, ShoppingBag } from "lucide-react";
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
import type { Category, Product } from "@/lib/types";
import {
  createProductAction,
  toggleProductStatusAction,
  updateProductAction,
} from "./actions";

const GST_RATES = ["0", "5", "12", "18"];
const VEG_OPTIONS = ["Veg", "Non-Veg"];

export type GroupOption = { id: number; display_name: string };

export function ProductManager({
  slug,
  categories,
  products,
  groups,
  productGroupIds,
}: {
  slug: string;
  categories: Category[];
  products: Product[];
  groups: GroupOption[];
  productGroupIds: Record<number, number[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const activeCategories = categories.filter((c) => c.status === "active");

  if (activeCategories.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="No active categories"
        description="Add at least one active category above before creating products."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {products.length === 0
            ? "No products yet."
            : `${products.length} ${products.length === 1 ? "product" : "products"}.`}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-3 w-3" /> Add product
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No products yet"
          description="Add your first item — it'll show up in the POS and customer storefront right away."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3 w-3" /> Add product
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>GST</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => {
              const isVeg = (p.veg_status ?? "Veg").toLowerCase() === "veg";
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <span
                      aria-label={isVeg ? "Veg" : "Non-veg"}
                      className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border ${
                        isVeg
                          ? "border-emerald-700 bg-emerald-500"
                          : "border-red-700 bg-red-500"
                      }`}
                    />
                    {p.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.category}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    ₹{Number(p.price).toFixed(0)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {Number(p.gst_rate ?? 5)}%
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.status === "active" ? "default" : "outline"}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={pending}
                      onClick={() => setEditing(p)}
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
                          const res = await toggleProductStatusAction(slug, p.id);
                          if (!res.ok) alert(res.error);
                          else router.refresh();
                        })
                      }
                      title={p.status === "active" ? "Disable" : "Enable"}
                    >
                      <Power className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Create + edit dialogs share one component, mounted twice with
          different opener state. */}
      <ProductDialog
        slug={slug}
        categories={activeCategories}
        groups={groups}
        selectedGroupIds={[]}
        open={creating}
        onOpenChange={setCreating}
        product={null}
        onDone={() => {
          setCreating(false);
          router.refresh();
        }}
        pending={pending}
        start={start}
      />
      <ProductDialog
        slug={slug}
        categories={activeCategories}
        groups={groups}
        selectedGroupIds={editing ? (productGroupIds[editing.id] ?? []) : []}
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        product={editing}
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

function ProductDialog({
  slug,
  categories,
  groups,
  selectedGroupIds,
  open,
  onOpenChange,
  product,
  onDone,
  pending,
  start,
}: {
  slug: string;
  categories: Category[];
  groups: GroupOption[];
  selectedGroupIds: number[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: Product | null;
  onDone: () => void;
  pending: boolean;
  start: React.TransitionStartFunction;
}) {
  const [category, setCategory] = useState<string>(
    product?.category ?? categories[0]?.name ?? "",
  );
  const [gstRate, setGstRate] = useState<string>(String(product?.gst_rate ?? 5));
  const [vegStatus, setVegStatus] = useState<string>(product?.veg_status ?? "Veg");
  const [groupIds, setGroupIds] = useState<Set<number>>(new Set(selectedGroupIds));
  const [err, setErr] = useState<string | null>(null);

  // Reset local state when the dialog opens with a different product.
  // useEffect would be cleaner; cheap enough to derive every render.
  if (open && product && category !== product.category && product.category) {
    setCategory(product.category);
  }

  // Re-seed group selection when the dialog opens for a different product.
  const [seedKey, setSeedKey] = useState<number | null>(null);
  const currentKey = product?.id ?? 0;
  if (open && seedKey !== currentKey) {
    setSeedKey(currentKey);
    setGroupIds(new Set(selectedGroupIds));
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
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            {product
              ? `Updating "${product.name}". Customers see the new values immediately.`
              : "GST rates are GST-inclusive — the price you enter is what customers pay."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            fd.set("category", category);
            fd.set("gst_rate", gstRate);
            fd.set("veg_status", vegStatus);
            fd.set("group_ids", JSON.stringify([...groupIds]));
            if (product) fd.set("id", String(product.id));
            setErr(null);
            start(async () => {
              const action = product ? updateProductAction : createProductAction;
              const res = await action(slug, fd);
              if (res.ok) onDone();
              else setErr(res.error);
            });
          }}
          className="grid gap-3"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="prd-name">Name</Label>
            <Input
              id="prd-name"
              name="name"
              required
              defaultValue={product?.name}
              placeholder="Masala Chai"
              autoFocus={!product}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="prd-price">Price (₹)</Label>
              <Input
                id="prd-price"
                name="price"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={product?.price ?? ""}
                placeholder="20"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.emoji ? `${c.emoji} ` : ""}
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>GST rate</Label>
              <Select value={gstRate} onValueChange={(v) => v && setGstRate(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GST_RATES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={vegStatus} onValueChange={(v) => v && setVegStatus(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VEG_OPTIONS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="prd-desc">Description (optional)</Label>
            <Input
              id="prd-desc"
              name="description"
              defaultValue={product?.description ?? ""}
              placeholder="Hot, sweet, ginger forward"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Customizations</Label>
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No customization groups yet. Create one in the Customizations
                section to offer add-ons here.
              </p>
            ) : (
              <div className="grid gap-1.5 rounded-md border p-2 sm:grid-cols-2">
                {groups.map((g) => {
                  const checked = groupIds.has(g.id);
                  return (
                    <label
                      key={g.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setGroupIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(g.id)) next.delete(g.id);
                            else next.add(g.id);
                            return next;
                          })
                        }
                        className="h-4 w-4"
                      />
                      {g.display_name}
                    </label>
                  );
                })}
              </div>
            )}
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
              {pending ? "Saving…" : product ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
