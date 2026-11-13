"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, ShoppingBag, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import type { Category, Product } from "@/lib/types";
import {
  createProductAction,
  toggleProductStatusAction,
  updateProductAction,
} from "./actions";

const GST_RATES = ["0", "5", "12", "18"];
const VEG_OPTIONS = ["Veg", "Non-Veg"];
const ALL_VALUE = "__all__";

export type GroupOption = { id: string; display_name: string };

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
  productGroupIds: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>(ALL_VALUE);
  const [statusFilter, setStatusFilter] = useState<string>(ALL_VALUE);

  const activeCategories = categories.filter((c) => c.status === "active");

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (catFilter !== ALL_VALUE && p.category !== catFilter) return false;
      if (statusFilter !== ALL_VALUE && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, catFilter, statusFilter, search]);

  if (activeCategories.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="No active categories"
        description="Switch to the Categories tab and add at least one active category before creating products."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap flex-1 items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search item or POS code…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          <Select
            value={catFilter}
            onValueChange={(v) => v && setCatFilter(v)}
          >
            <SelectTrigger size="sm" className="w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.name}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v) => v && setStatusFilter(v)}
          >
            <SelectTrigger size="sm" className="w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>All statuses</SelectItem>
              <SelectItem value="active">In stock (Active)</SelectItem>
              <SelectItem value="inactive">Sold out / Hidden</SelectItem>
            </SelectContent>
          </Select>

          {(search ||
            catFilter !== ALL_VALUE ||
            statusFilter !== ALL_VALUE) && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setSearch("");
                setCatFilter(ALL_VALUE);
                setStatusFilter(ALL_VALUE);
              }}
            >
              <X className="mr-1 h-3 w-3" /> Reset
            </Button>
          )}
        </div>

        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add product
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No products yet"
          description="Add your first item — it'll show up in the POS and customer storefront right away."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add product
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="pl-3">Item</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>In Stock</TableHead>
                <TableHead className="w-16 pr-3 text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((p) => {
                const isVeg = (p.veg_status ?? "Veg").toLowerCase() === "veg";
                const isActive = p.status === "active";
                const attachedCount = productGroupIds[p.id]?.length ?? 0;

                return (
                  <TableRow key={p.id}>
                    <TableCell className="pl-3">
                      <div className="flex items-center gap-2.5">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="h-9 w-9 shrink-0 rounded-lg border border-border object-cover bg-muted"
                          />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                            <ShoppingBag className="h-3.5 w-3.5 opacity-50" />
                          </div>
                        )}
                        <span
                          aria-label={isVeg ? "Veg" : "Non-veg"}
                          className={cn(
                            "flex h-3 w-3 shrink-0 items-center justify-center rounded-[2px] border",
                            isVeg ? "border-emerald-600" : "border-rose-600",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              isVeg ? "bg-emerald-600" : "bg-rose-600",
                            )}
                          />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                            <span>{p.name}</span>
                            {attachedCount > 0 && (
                              <Badge variant="secondary" className="h-4 px-1 text-[11px]">
                                +{attachedCount} mod
                              </Badge>
                            )}
                          </div>
                          {p.description && (
                            <div className="max-w-xs truncate text-[11px] text-muted-foreground">
                              {p.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-xs text-muted-foreground">
                      {p.code ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.category}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      ₹{Number(p.price).toFixed(0)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Number(p.gst_rate ?? 5)}%
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isActive}
                          disabled={pending}
                          onCheckedChange={() =>
                            start(async () => {
                              const res = await toggleProductStatusAction(
                                slug,
                                p.id,
                              );
                              if (!res.ok) alert(res.error);
                              else router.refresh();
                            })
                          }
                        />
                        <span
                          className={cn(
                            "text-[11px]",
                            isActive
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {isActive ? "Active" : "Sold out"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="pr-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={pending}
                        onClick={() => setEditing(p)}
                        title="Edit product"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-xs text-muted-foreground"
                  >
                    No products match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

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
  selectedGroupIds: string[];
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
  const [vegStatus, setVegStatus] = useState<string>(
    product?.veg_status ?? "Veg",
  );
  const [groupIds, setGroupIds] = useState<Set<string>>(
    new Set(selectedGroupIds),
  );
  const [err, setErr] = useState<string | null>(null);

  if (open && product && category !== product.category && product.category) {
    setCategory(product.category);
  }

  const [seedKey, setSeedKey] = useState<string | null>(null);
  const currentKey = product?.id ?? "";
  if (open && seedKey !== currentKey) {
    setSeedKey(currentKey);
    setGroupIds(new Set(selectedGroupIds));
    setGstRate(String(product?.gst_rate ?? 5));
    setVegStatus(product?.veg_status ?? "Veg");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            {product
              ? `Updating "${product.name}". Changes apply immediately.`
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
              const action = product
                ? updateProductAction
                : createProductAction;
              const res = await action(slug, fd);
              if (res.ok) onDone();
              else setErr(res.error);
            });
          }}
          className="grid gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            <div className="grid gap-1.5">
              <Label htmlFor="prd-name">Product name</Label>
              <Input
                id="prd-name"
                name="name"
                required
                defaultValue={product?.name}
                placeholder="Masala Dosa"
                autoFocus={!product}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="prd-code">POS code</Label>
              <Input
                id="prd-code"
                name="code"
                defaultValue={product?.code ?? ""}
                placeholder="MD01"
                className="font-mono uppercase"
              />
            </div>
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
                placeholder="120"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => v && setCategory(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label>GST rate</Label>
              <Select value={gstRate} onValueChange={(v) => v && setGstRate(v)}>
                <SelectTrigger className="w-full">
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
              <Label>Dietary type</Label>
              <Select
                value={vegStatus}
                onValueChange={(v) => v && setVegStatus(v)}
              >
                <SelectTrigger className="w-full">
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

          <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
            <div className="grid gap-1.5">
              <Label htmlFor="prd-desc">Description (optional)</Label>
              <Input
                id="prd-desc"
                name="description"
                defaultValue={product?.description ?? ""}
                placeholder="Crispy crepe with spiced potato masala"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="prd-hsn">HSN / SAC</Label>
              <Input
                id="prd-hsn"
                name="hsn_code"
                defaultValue={product?.hsn_code ?? ""}
                placeholder="996331"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="prd-image">Image URL (optional)</Label>
            <Input
              id="prd-image"
              name="image_url"
              defaultValue={product?.image_url ?? ""}
              placeholder="https://images.unsplash.com/..."
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Customization groups</Label>
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No customization groups yet. Create one in the Customizations tab to offer add-ons here.
              </p>
            ) : (
              <div className="grid gap-1.5 rounded-lg border border-border p-2 sm:grid-cols-2">
                {groups.map((g) => {
                  const checked = groupIds.has(g.id);
                  return (
                    <label
                      key={g.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted"
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
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      {g.display_name}
                    </label>
                  );
                })}
              </div>
            )}
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
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : product ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
