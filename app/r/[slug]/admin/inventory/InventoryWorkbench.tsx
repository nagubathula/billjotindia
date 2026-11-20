"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  ChefHat,
  Download,
  History,
  IndianRupee,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  InventoryMaterial,
  InventoryStockMovement,
  ProductRecipe,
  Vendor,
  VendorPurchaseOrder,
} from "@/lib/types";
import {
  adjustMaterialStockAction,
  deleteMaterialAction,
  saveMaterialAction,
  saveProductRecipeAction,
} from "./actions";

export type MenuProductSummary = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  price: number;
  veg_status: string | null;
  sold30d: number;
};

const CATEGORIES = [
  { value: "produce", label: "Fresh Produce" },
  { value: "meat_seafood", label: "Meat & Seafood" },
  { value: "dairy_oils", label: "Dairy & Oils" },
  { value: "grocery", label: "Grains & Grocery" },
  { value: "spices", label: "Spices & Dry Goods" },
  { value: "packaging", label: "Packaging & Disposables" },
  { value: "beverages", label: "Beverages" },
  { value: "other", label: "Other" },
] as const;

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);

const UNITS = ["kg", "g", "L", "ml", "pcs", "pkt", "rolls"] as const;

const MOVEMENT_META: Record<
  string,
  { label: string; badgeClass: string }
> = {
  opening: {
    label: "Opening",
    badgeClass: "border-slate-300 bg-slate-500/10 text-slate-700",
  },
  purchase_grn: {
    label: "PO GRN",
    badgeClass: "border-emerald-300 bg-emerald-500/10 text-emerald-700",
  },
  order_consumption: {
    label: "Order BOM",
    badgeClass: "border-blue-300 bg-blue-500/10 text-blue-700",
  },
  wastage: {
    label: "Wastage",
    badgeClass: "border-rose-300 bg-rose-500/10 text-rose-700",
  },
  manual_adjustment: {
    label: "Adjustment",
    badgeClass: "border-amber-300 bg-amber-500/10 text-amber-800",
  },
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const inrExact = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type RecipeDraftLine = {
  materialId: string;
  quantityPerUnit: string;
  wastagePct: string;
};

export function InventoryWorkbench({
  restaurantSlug,
  outlets,
  defaultOutletId,
  products,
  initialMaterials,
  initialRecipes,
  initialMovements,
  vendors,
  purchaseOrders,
}: {
  restaurantSlug: string;
  outlets: Array<{ id: string; name: string }>;
  defaultOutletId: string;
  products: MenuProductSummary[];
  initialMaterials: InventoryMaterial[];
  initialRecipes: ProductRecipe[];
  initialMovements: InventoryStockMovement[];
  vendors: Array<Pick<Vendor, "id" | "vendor_code" | "name" | "status">>;
  purchaseOrders: VendorPurchaseOrder[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [bannerError, setBannerError] = useState<string | null>(null);

  const [materials, setMaterials] =
    useState<InventoryMaterial[]>(initialMaterials);
  const [recipes, setRecipes] = useState<ProductRecipe[]>(initialRecipes);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low">("all");
  const [recipeSearch, setRecipeSearch] = useState("");

  // Material Add/Edit Dialog state
  const [matDialogOpen, setMatDialogOpen] = useState(false);
  const [editingMatId, setEditingMatId] = useState<string | null>(null);
  const [matSku, setMatSku] = useState("");
  const [matName, setMatName] = useState("");
  const [matCat, setMatCat] = useState<string>("spices");
  const [matUnit, setMatUnit] = useState("kg");
  const [matStock, setMatStock] = useState("10");
  const [matReorder, setMatReorder] = useState("5");
  const [matCost, setMatCost] = useState("150");
  const [matVendorId, setMatVendorId] = useState<string>("__none__");
  const [matOutletId, setMatOutletId] = useState<string>("__all__");
  const [matError, setMatError] = useState<string | null>(null);

  // Stock Adjust / Wastage Dialog state
  const [adjTarget, setAdjTarget] = useState<InventoryMaterial | null>(null);
  const [adjMode, setAdjMode] = useState<"manual_adjustment" | "wastage">(
    "wastage",
  );
  const [adjQty, setAdjQty] = useState("1");
  const [adjNote, setAdjNote] = useState("");
  const [adjError, setAdjError] = useState<string | null>(null);

  // Recipe BOM Dialog state
  const [recipeProduct, setRecipeProduct] = useState<MenuProductSummary | null>(
    null,
  );
  const [recipeDrafts, setRecipeDrafts] = useState<RecipeDraftLine[]>([]);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  const vendorById = useMemo(
    () => new Map(vendors.map((v) => [v.id, v])),
    [vendors],
  );
  const materialById = useMemo(
    () => new Map(materials.map((m) => [m.id, m])),
    [materials],
  );

  const lowStockCount = useMemo(
    () =>
      materials.filter(
        (m) =>
          m.status === "active" &&
          Number(m.current_stock ?? 0) <= Number(m.reorder_level ?? 0),
      ).length,
    [materials],
  );

  const totalInventoryValue = useMemo(
    () =>
      materials.reduce(
        (s, m) =>
          s + Number(m.current_stock ?? 0) * Number(m.cost_per_unit ?? 0),
        0,
      ),
    [materials],
  );

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (catFilter !== "all" && m.category !== catFilter) return false;
      const isLow =
        Number(m.current_stock ?? 0) <= Number(m.reorder_level ?? 0);
      if (stockFilter === "low" && !isLow) return false;
      if (!q) return true;
      const vendorName = m.vendor_id
        ? vendorById.get(m.vendor_id)?.name?.toLowerCase() ?? ""
        : "";
      return (
        m.name.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        vendorName.includes(q)
      );
    });
  }, [materials, search, catFilter, stockFilter, vendorById]);

  const recipesByProduct = useMemo(() => {
    const map = new Map<string, ProductRecipe[]>();
    for (const r of recipes) {
      const list = map.get(r.product_id) ?? [];
      list.push(r);
      map.set(r.product_id, list);
    }
    return map;
  }, [recipes]);

  const dishMargins = useMemo(() => {
    const q = recipeSearch.trim().toLowerCase();
    return products
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      )
      .map((p) => {
        const bomLines = recipesByProduct.get(p.id) ?? [];
        let foodCost = 0;
        const summaryParts: string[] = [];

        for (const bl of bomLines) {
          const mat = materialById.get(bl.material_id);
          if (!mat) continue;
          const qty = Number(bl.quantity_per_unit ?? 0);
          const waste = Number(bl.wastage_pct ?? 0);
          const unitCost = Number(mat.cost_per_unit ?? 0);
          foodCost += qty * (1 + waste / 100) * unitCost;
          summaryParts.push(`${qty} ${mat.unit} ${mat.name}`);
        }

        const roundedCost = Math.round(foodCost * 100) / 100;
        const margin = p.price - roundedCost;
        const costPct = p.price > 0 ? Math.round((roundedCost / p.price) * 100) : 0;

        return {
          ...p,
          bomCount: bomLines.length,
          summaryText: summaryParts.join(", "),
          foodCost: roundedCost,
          margin,
          costPct,
        };
      });
  }, [products, recipesByProduct, materialById, recipeSearch]);

  const configuredBomDishes = useMemo(
    () => products.filter((p) => (recipesByProduct.get(p.id)?.length ?? 0) > 0),
    [products, recipesByProduct],
  );

  const avgFoodCostPct = useMemo(() => {
    const priced = dishMargins.filter((d) => d.bomCount > 0 && d.price > 0);
    if (priced.length === 0) return 0;
    return Math.round(
      priced.reduce((s, r) => s + r.costPct, 0) / priced.length,
    );
  }, [dishMargins]);

  function openNewMaterialDialog() {
    setEditingMatId(null);
    setMatSku("");
    setMatName("");
    setMatCat("spices");
    setMatUnit("kg");
    setMatStock("10");
    setMatReorder("5");
    setMatCost("150");
    setMatVendorId(vendors[0]?.id ?? "__none__");
    setMatOutletId(defaultOutletId || "__all__");
    setMatError(null);
    setMatDialogOpen(true);
  }

  function openEditMaterialDialog(m: InventoryMaterial) {
    setEditingMatId(m.id);
    setMatSku(m.sku);
    setMatName(m.name);
    setMatCat(m.category);
    setMatUnit(m.unit);
    setMatStock(String(Number(m.current_stock ?? 0)));
    setMatReorder(String(Number(m.reorder_level ?? 0)));
    setMatCost(String(Number(m.cost_per_unit ?? 0)));
    setMatVendorId(m.vendor_id ?? "__none__");
    setMatOutletId(m.outlet_id ?? "__all__");
    setMatError(null);
    setMatDialogOpen(true);
  }

  function handleSaveMaterial(e: React.FormEvent) {
    e.preventDefault();
    setMatError(null);
    startTransition(async () => {
      const res = await saveMaterialAction(restaurantSlug, {
        id: editingMatId,
        sku: matSku,
        name: matName,
        category: matCat,
        unit: matUnit,
        currentStock: Number(matStock) || 0,
        reorderLevel: Number(matReorder) || 0,
        costPerUnit: Number(matCost) || 0,
        vendorId: matVendorId,
        outletId: matOutletId,
        status: "active",
      });
      if (!res.ok) {
        setMatError(res.error);
        return;
      }
      setMatDialogOpen(false);
      router.refresh();
    });
  }

  function quickAdjust(materialId: string, delta: number) {
    setBannerError(null);
    startTransition(async () => {
      const res = await adjustMaterialStockAction(restaurantSlug, {
        materialId,
        movementType: "manual_adjustment",
        quantityDelta: delta,
        note: delta > 0 ? "Quick + stock check" : "Quick - stock check",
      });
      if (!res.ok) {
        setBannerError(res.error);
        return;
      }
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === materialId ? { ...m, current_stock: res.nextStock } : m,
        ),
      );
      router.refresh();
    });
  }

  function handleConfirmAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!adjTarget) return;
    setAdjError(null);
    const val = Number(adjQty) || 0;
    if (val === 0) {
      setAdjError("Enter a non-zero quantity.");
      return;
    }
    startTransition(async () => {
      const res = await adjustMaterialStockAction(restaurantSlug, {
        materialId: adjTarget.id,
        movementType: adjMode,
        quantityDelta: adjMode === "wastage" ? -Math.abs(val) : val,
        note: adjNote,
      });
      if (!res.ok) {
        setAdjError(res.error);
        return;
      }
      setMaterials((prev) =>
        prev.map((m) =>
          m.id === adjTarget.id ? { ...m, current_stock: res.nextStock } : m,
        ),
      );
      setAdjTarget(null);
      router.refresh();
    });
  }

  function handleDeleteMaterial(m: InventoryMaterial) {
    setBannerError(null);
    startTransition(async () => {
      const res = await deleteMaterialAction(restaurantSlug, m.id);
      if (!res.ok) {
        setBannerError(res.error);
        return;
      }
      setMaterials((prev) => prev.filter((x) => x.id !== m.id));
      router.refresh();
    });
  }

  function openRecipeEditor(product: MenuProductSummary) {
    const existing = recipesByProduct.get(product.id) ?? [];
    setRecipeProduct(product);
    setRecipeError(null);
    setRecipeDrafts(
      existing.length > 0
        ? existing.map((l) => ({
            materialId: l.material_id,
            quantityPerUnit: String(Number(l.quantity_per_unit)),
            wastagePct: String(Number(l.wastage_pct ?? 0)),
          }))
        : [
            {
              materialId: materials[0]?.id ?? "",
              quantityPerUnit: "0.15",
              wastagePct: "5",
            },
          ],
    );
  }

  function handleSaveRecipe(e: React.FormEvent) {
    e.preventDefault();
    if (!recipeProduct) return;
    setRecipeError(null);
    startTransition(async () => {
      const res = await saveProductRecipeAction(restaurantSlug, {
        productId: recipeProduct.id,
        lines: recipeDrafts
          .filter((d) => d.materialId && Number(d.quantityPerUnit) > 0)
          .map((d) => ({
            materialId: d.materialId,
            quantityPerUnit: Number(d.quantityPerUnit),
            wastagePct: Number(d.wastagePct) || 0,
          })),
      });
      if (!res.ok) {
        setRecipeError(res.error);
        return;
      }
      setRecipes((prev) => [
        ...prev.filter((r) => r.product_id !== recipeProduct.id),
        ...recipeDrafts
          .filter((d) => d.materialId && Number(d.quantityPerUnit) > 0)
          .map((d, idx) => ({
            id: `temp-${idx}`,
            restaurant_id: "",
            product_id: recipeProduct.id,
            material_id: d.materialId,
            quantity_per_unit: Number(d.quantityPerUnit),
            wastage_pct: Number(d.wastagePct) || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
      ]);
      setRecipeProduct(null);
      router.refresh();
    });
  }

  function exportMaterialsCsv() {
    const header = [
      "SKU",
      "Name",
      "Category",
      "Unit",
      "Current Stock",
      "Reorder Level",
      "Unit Cost (INR)",
      "Valuation (INR)",
      "Supplier",
    ];
    const rows = materials.map((m) => {
      const st = Number(m.current_stock ?? 0);
      const uc = Number(m.cost_per_unit ?? 0);
      const supplier = m.vendor_id
        ? vendorById.get(m.vendor_id)?.name ?? ""
        : "";
      return [
        m.sku,
        m.name,
        CAT_LABEL[m.category] ?? m.category,
        m.unit,
        st,
        Number(m.reorder_level ?? 0),
        uc,
        (st * uc).toFixed(2),
        supplier,
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(",");
    });
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${restaurantSlug}-inventory-materials.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {bannerError && (
        <div className="rounded-lg bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {bannerError}
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Inventory Valuation</span>
              <IndianRupee className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(totalInventoryValue)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Across {materials.length} raw materials &amp; packaging SKUs
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Low-Stock Alerts</span>
              <AlertTriangle
                className={cn(
                  "h-3.5 w-3.5",
                  lowStockCount > 0 ? "text-amber-600" : "",
                )}
              />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {lowStockCount}
              </span>
              {lowStockCount > 0 && (
                <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15">
                  Reorder needed
                </Badge>
              )}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Items at or below minimum par level
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Dishes with Recipe BOM</span>
              <ChefHat className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {configuredBomDishes.length}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {products.length}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Auto-deducts stock when orders settle/complete
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Avg BOM Food Cost %</span>
              <Boxes className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {avgFoodCostPct > 0 ? `${avgFoodCostPct}%` : "—"}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Live margin across BOM-linked menu dishes
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="materials" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="materials">
              Raw Materials ({materials.length})
            </TabsTrigger>
            <TabsTrigger value="recipes">
              Recipe BOM &amp; Margins ({products.length})
            </TabsTrigger>
            <TabsTrigger value="ledger">
              Stock Ledger ({initialMovements.length})
            </TabsTrigger>
            <TabsTrigger value="pos">
              Supplier POs ({purchaseOrders.length})
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportMaterialsCsv}
              disabled={materials.length === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              CSV
            </Button>
            <Button size="sm" onClick={openNewMaterialDialog}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Raw Material
            </Button>
          </div>
        </div>

        {/* TAB 1: RAW MATERIALS STOCK */}
        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative min-w-[220px] flex-1 max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search SKU, ingredient, or supplier..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant={stockFilter === "all" ? "default" : "outline"}
                    size="xs"
                    onClick={() => setStockFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={stockFilter === "low" ? "default" : "outline"}
                    size="xs"
                    onClick={() => setStockFilter("low")}
                  >
                    Low Stock ({lowStockCount})
                  </Button>
                  <Select
                    value={catFilter}
                    onValueChange={(val) => setCatFilter(val ?? "all")}
                  >
                    <SelectTrigger className="h-7 w-[170px] text-xs">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU / Material</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Preferred Supplier</TableHead>
                    <TableHead className="text-right">In Stock</TableHead>
                    <TableHead className="text-right">Par Level</TableHead>
                    <TableHead className="text-right">Avg Cost / Unit</TableHead>
                    <TableHead className="text-right">Valuation</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        {materials.length === 0
                          ? "No raw materials added yet. Add ingredients manually or receive a Supplier PO to populate stock."
                          : "No raw materials match your filters."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMaterials.map((m) => {
                      const stock = Number(m.current_stock ?? 0);
                      const par = Number(m.reorder_level ?? 0);
                      const cost = Number(m.cost_per_unit ?? 0);
                      const isLow = stock <= par;
                      const supplier = m.vendor_id
                        ? vendorById.get(m.vendor_id)?.name ?? "—"
                        : "—";

                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="font-medium">{m.name}</div>
                            <div className="text-[11px] font-mono text-muted-foreground">
                              {m.sku}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[11px]">
                              {CAT_LABEL[m.category] ?? m.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {supplier}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span
                              className={cn(
                                "font-semibold",
                                isLow ? "text-amber-700" : "",
                              )}
                            >
                              {stock} {m.unit}
                            </span>
                            {isLow && (
                              <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                LOW
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                            {par} {m.unit}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {inrExact(cost)}/{m.unit}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {inr(stock * cost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={busy}
                                onClick={() => quickAdjust(m.id, -1)}
                                title="Deduct 1 unit"
                              >
                                −1
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                disabled={busy}
                                onClick={() => quickAdjust(m.id, 1)}
                                title="Add 1 unit"
                              >
                                +1
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                disabled={busy}
                                title="Log wastage / stock count"
                                onClick={() => {
                                  setAdjTarget(m);
                                  setAdjMode("wastage");
                                  setAdjQty("1");
                                  setAdjNote("");
                                  setAdjError(null);
                                }}
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                disabled={busy}
                                title="Edit material"
                                onClick={() => openEditMaterialDialog(m)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                disabled={busy}
                                title="Delete material"
                                onClick={() => handleDeleteMaterial(m)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: RECIPE BOM & MARGINS */}
        <TabsContent value="recipes" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    Dish Recipe Costing &amp; Food-Cost Margins
                  </CardTitle>
                  <CardDescription>
                    Bind raw materials (plus prep wastage %) to each dish. Settled &amp; completed orders automatically deduct ingredient stock.
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                    placeholder="Filter menu dishes..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dish / Category</TableHead>
                    <TableHead>Recipe BOM Ingredients</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    <TableHead className="text-right">BOM Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Food Cost %</TableHead>
                    <TableHead className="text-right">30d Sold</TableHead>
                    <TableHead className="text-right">BOM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dishMargins.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        No matching menu items found for the selected outlet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    dishMargins.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.category}
                            {r.code ? ` · ${r.code}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-sm text-xs text-muted-foreground">
                          {r.bomCount > 0 ? (
                            r.summaryText
                          ) : (
                            <span className="italic text-muted-foreground/70">
                              No BOM linked yet
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {inr(r.price)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {r.bomCount > 0 ? inrExact(r.foodCost) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 tabular-nums">
                          {r.bomCount > 0 ? inr(r.margin) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.bomCount > 0 ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px] tabular-nums",
                                r.costPct <= 35
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                                  : "border-amber-500/40 bg-amber-500/10 text-amber-800",
                              )}
                            >
                              {r.costPct}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium tabular-nums">
                          {r.sold30d}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={materials.length === 0}
                            onClick={() => openRecipeEditor(r)}
                          >
                            {r.bomCount > 0 ? "Edit BOM" : "Link BOM"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: STOCK MOVEMENT LEDGER */}
        <TabsContent value="ledger" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Inventory Stock Ledger
              </CardTitle>
              <CardDescription>
                Immutable log of opening balances, vendor GRN receipts, automated order BOM deductions, wastage, and manual counts.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead className="text-right">Stock After</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialMovements.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        No stock movements recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    initialMovements.map((mv) => {
                      const mat = materialById.get(mv.material_id);
                      const delta = Number(mv.quantity_delta ?? 0);
                      const meta = MOVEMENT_META[mv.movement_type] ?? {
                        label: mv.movement_type,
                        badgeClass: "border-border",
                      };
                      return (
                        <TableRow key={mv.id}>
                          <TableCell>
                            <div className="font-medium">
                              {mat?.name ?? "Material"}
                            </div>
                            {mat?.sku && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {mat.sku}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={meta.badgeClass}>
                              {meta.label}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold tabular-nums",
                              delta >= 0 ? "text-emerald-700" : "text-rose-700",
                            )}
                          >
                            {delta > 0 ? `+${delta}` : delta}{" "}
                            {mat?.unit ?? ""}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {Number(mv.stock_after ?? 0)} {mat?.unit ?? ""}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                            {mv.note ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {mv.created_by ?? "system"}
                          </TableCell>
                          <TableCell className="text-right text-[11px] text-muted-foreground tabular-nums">
                            {new Date(mv.created_at).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: LIVE VENDOR PURCHASE ORDERS */}
        <TabsContent value="pos" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Supplier Purchase Orders (GRN Sync)
                  </CardTitle>
                  <CardDescription>
                    Marking any PO as Received in Vendors automatically restocks matching materials and updates weighted average cost.
                  </CardDescription>
                </div>
                <Link
                  href={`/r/${restaurantSlug}/admin/vendors`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                  )}
                >
                  <Truck className="mr-1.5 h-3.5 w-3.5" />
                  Manage POs in Vendors
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Items Summary</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-10 text-center text-xs text-muted-foreground"
                      >
                        No purchase orders created yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    purchaseOrders.map((po) => {
                      const itemsArr = Array.isArray(po.items)
                        ? (po.items as Array<{
                            name?: string;
                            qty?: number;
                            unit?: string;
                          }>)
                        : [];
                      const summary = itemsArr
                        .slice(0, 3)
                        .map((it) => `${it.qty ?? 0} ${it.unit ?? ""} ${it.name ?? ""}`)
                        .join(", ");
                      const vendorName =
                        vendorById.get(po.vendor_id)?.name ?? "Supplier";
                      return (
                        <TableRow key={po.id}>
                          <TableCell className="font-mono text-xs font-semibold">
                            {po.po_number}
                          </TableCell>
                          <TableCell className="font-medium">
                            {vendorName}
                          </TableCell>
                          <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                            {summary || "—"}
                            {itemsArr.length > 3
                              ? ` (+${itemsArr.length - 3} more)`
                              : ""}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {po.order_date}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {inr(Number(po.total_amount ?? 0))}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant={
                                po.status === "received"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {po.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add / Edit Raw Material Dialog */}
      <Dialog open={matDialogOpen} onOpenChange={setMatDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <PackagePlus className="h-4 w-4 text-primary" />
              {editingMatId ? "Edit Raw Material" : "Add Raw Material SKU"}
            </DialogTitle>
            <DialogDescription>
              Track kitchen stock levels, minimum par alerts, and cost per unit.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveMaterial} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">SKU (optional)</Label>
                <Input
                  value={matSku}
                  onChange={(e) => setMatSku(e.target.value)}
                  placeholder="Auto RM-..."
                  className="h-8 font-mono text-xs uppercase"
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Material Name</Label>
                <Input
                  value={matName}
                  onChange={(e) => setMatName(e.target.value)}
                  placeholder="e.g., Aged Basmati Rice"
                  required
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={matCat}
                  onValueChange={(v) => v && setMatCat(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Select value={matUnit} onValueChange={(v) => v && setMatUnit(v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Current Stock</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={matStock}
                  onChange={(e) => setMatStock(e.target.value)}
                  className="h-8 text-xs tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Min Par Level</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={matReorder}
                  onChange={(e) => setMatReorder(e.target.value)}
                  className="h-8 text-xs tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cost / Unit (₹)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={matCost}
                  onChange={(e) => setMatCost(e.target.value)}
                  className="h-8 text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Preferred Supplier</Label>
                <Select
                  value={matVendorId}
                  onValueChange={(v) => v && setMatVendorId(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No fixed vendor</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Outlet Scope</Label>
                <Select
                  value={matOutletId}
                  onValueChange={(v) => v && setMatOutletId(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Outlets (Shared)</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {matError && (
              <p className="rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {matError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMatDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : editingMatId ? (
                  "Save Changes"
                ) : (
                  "Create Material"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Stock Adjustment / Wastage Dialog */}
      <Dialog
        open={adjTarget !== null}
        onOpenChange={(open) => !open && setAdjTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {adjMode === "wastage" ? "Log Kitchen Wastage" : "Adjust Stock Count"}
            </DialogTitle>
            <DialogDescription>
              {adjTarget?.name} (Current: {Number(adjTarget?.current_stock ?? 0)}{" "}
              {adjTarget?.unit})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmAdjustment} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={adjMode === "wastage" ? "default" : "outline"}
                size="sm"
                onClick={() => setAdjMode("wastage")}
              >
                Wastage (−)
              </Button>
              <Button
                type="button"
                variant={adjMode === "manual_adjustment" ? "default" : "outline"}
                size="sm"
                onClick={() => setAdjMode("manual_adjustment")}
              >
                Stock Count (+/−)
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">
                Quantity ({adjTarget?.unit}){" "}
                {adjMode === "wastage" ? "wasted" : "change (+/-)"}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={adjQty}
                onChange={(e) => setAdjQty(e.target.value)}
                required
                className="h-8 text-xs tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Reason / Note</Label>
              <Input
                value={adjNote}
                onChange={(e) => setAdjNote(e.target.value)}
                placeholder="Spoilage, physical audit, spillage..."
                className="h-8 text-xs"
              />
            </div>

            {adjError && (
              <p className="rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {adjError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAdjTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                Record Movement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dish Recipe BOM Dialog */}
      <Dialog
        open={recipeProduct !== null}
        onOpenChange={(open) => !open && setRecipeProduct(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              Recipe BOM · {recipeProduct?.name}
            </DialogTitle>
            <DialogDescription>
              Specify ingredient quantities per 1 sold portion. Stock is deducted automatically when orders complete.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRecipe} className="space-y-3">
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {recipeDrafts.map((row, idx) => {
                const mat = materialById.get(row.materialId);
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_90px_80px_32px] items-end gap-2"
                  >
                    <div className="space-y-1">
                      <Label className="text-[11px]">Raw Material</Label>
                      <Select
                        value={row.materialId}
                        onValueChange={(v) => {
                          if (!v) return;
                          setRecipeDrafts((prev) =>
                            prev.map((d, i) =>
                              i === idx ? { ...d, materialId: v } : d,
                            ),
                          );
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Choose ingredient" />
                        </SelectTrigger>
                        <SelectContent>
                          {materials.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} ({m.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">
                        Qty ({mat?.unit ?? "unit"})
                      </Label>
                      <Input
                        type="number"
                        step="0.001"
                        min={0}
                        value={row.quantityPerUnit}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRecipeDrafts((prev) =>
                            prev.map((d, i) =>
                              i === idx ? { ...d, quantityPerUnit: v } : d,
                            ),
                          );
                        }}
                        className="h-8 text-xs tabular-nums"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Waste %</Label>
                      <Input
                        type="number"
                        step="1"
                        min={0}
                        max={100}
                        value={row.wastagePct}
                        onChange={(e) => {
                          const v = e.target.value;
                          setRecipeDrafts((prev) =>
                            prev.map((d, i) =>
                              i === idx ? { ...d, wastagePct: v } : d,
                            ),
                          );
                        }}
                        className="h-8 text-xs tabular-nums"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setRecipeDrafts((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={materials.length === 0}
              onClick={() =>
                setRecipeDrafts((prev) => [
                  ...prev,
                  {
                    materialId: materials[0]?.id ?? "",
                    quantityPerUnit: "0.10",
                    wastagePct: "5",
                  },
                ])
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Ingredient Line
            </Button>

            {recipeError && (
              <p className="rounded bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {recipeError}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRecipeProduct(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving BOM…
                  </>
                ) : (
                  "Save Recipe BOM"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
