"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChefHat,
  IndianRupee,
  PackagePlus,
  Plus,
  Search,
  Truck,
  Utensils,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export type MenuProductSummary = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  price: number;
  veg_status: string | null;
  sold30d: number;
};

type RawMaterial = {
  id: string;
  sku: string;
  name: string;
  category: "Grains & Pulses" | "Meat & Seafood" | "Spices & Produce" | "Dairy & Oils" | "Packaging";
  stock: number;
  unit: string;
  minLevel: number;
  costPerUnit: number;
  supplier: string;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplier: string;
  itemsSummary: string;
  amount: number;
  status: "Pending Delivery" | "Received";
  date: string;
};

const INITIAL_MATERIALS: RawMaterial[] = [
  { id: "rm-1", sku: "RM-GR01", name: "Aged Basmati Rice (XXL)", category: "Grains & Pulses", stock: 48, unit: "kg", minLevel: 20, costPerUnit: 115, supplier: "Godavari Agro Traders" },
  { id: "rm-2", sku: "RM-GR02", name: "Chitti Muthyalu Short-Grain Rice", category: "Grains & Pulses", stock: 14, unit: "kg", minLevel: 15, costPerUnit: 130, supplier: "Godavari Agro Traders" },
  { id: "rm-3", sku: "RM-GR03", name: "Sona Masoori Steaming Rice", category: "Grains & Pulses", stock: 65, unit: "kg", minLevel: 25, costPerUnit: 62, supplier: "Godavari Agro Traders" },
  { id: "rm-4", sku: "RM-MT01", name: "Fresh Broiler Chicken (Curry Cut)", category: "Meat & Seafood", stock: 22, unit: "kg", minLevel: 15, costPerUnit: 210, supplier: "Deccan Fresh Poultry" },
  { id: "rm-5", sku: "RM-MT02", name: "Natu Kodi (Country Chicken)", category: "Meat & Seafood", stock: 6.5, unit: "kg", minLevel: 8, costPerUnit: 420, supplier: "Deccan Fresh Poultry" },
  { id: "rm-6", sku: "RM-MT03", name: "Tender Goat Mutton (Biryani Cut)", category: "Meat & Seafood", stock: 9, unit: "kg", minLevel: 10, costPerUnit: 740, supplier: "Deccan Fresh Poultry" },
  { id: "rm-7", sku: "RM-MT04", name: "Bhimavaram Tiger Prawns (Cleaned)", category: "Meat & Seafood", stock: 5.5, unit: "kg", minLevel: 5, costPerUnit: 560, supplier: "Coastal Catch Seafoods" },
  { id: "rm-8", sku: "RM-SP01", name: "Guntur Sannam Dry Red Chillies", category: "Spices & Produce", stock: 11, unit: "kg", minLevel: 5, costPerUnit: 290, supplier: "Guntur Mirchi Yard Co." },
  { id: "rm-9", sku: "RM-SP02", name: "Ulavacharu (Concentrated Horsegram Paste)", category: "Spices & Produce", stock: 4.2, unit: "L", minLevel: 6, costPerUnit: 340, supplier: "Krishna Homemade Foods" },
  { id: "rm-10", sku: "RM-SP03", name: "Fresh Red Gongura (Sorrel Leaves)", category: "Spices & Produce", stock: 7.5, unit: "kg", minLevel: 5, costPerUnit: 85, supplier: "Rythu Bazaar Produce" },
  { id: "rm-11", sku: "RM-DO01", name: "Pure Cow Bilona Ghee", category: "Dairy & Oils", stock: 12, unit: "L", minLevel: 6, costPerUnit: 640, supplier: "Nizam Pure Dairy" },
  { id: "rm-12", sku: "RM-DO02", name: "Cold-Pressed Groundnut Oil", category: "Dairy & Oils", stock: 34, unit: "L", minLevel: 15, costPerUnit: 175, supplier: "Nizam Pure Dairy" },
  { id: "rm-13", sku: "RM-DO03", name: "Fresh Malai Paneer Block", category: "Dairy & Oils", stock: 8.5, unit: "kg", minLevel: 6, costPerUnit: 360, supplier: "Nizam Pure Dairy" },
  { id: "rm-14", sku: "RM-PK01", name: "750ml Tamper-Proof Biryani Handi Box", category: "Packaging", stock: 140, unit: "pcs", minLevel: 150, costPerUnit: 11, supplier: "EcoPack F&B Supplies" },
  { id: "rm-15", sku: "RM-PK02", name: "250ml Leak-Proof Salan/Raitha Cup", category: "Packaging", stock: 310, unit: "pcs", minLevel: 150, costPerUnit: 4.5, supplier: "EcoPack F&B Supplies" },
  { id: "rm-16", sku: "RM-PK03", name: "80mm Thermal POS Paper Rolls", category: "Packaging", stock: 18, unit: "rolls", minLevel: 10, costPerUnit: 42, supplier: "EcoPack F&B Supplies" },
];

const INITIAL_POS: PurchaseOrder[] = [
  {
    id: "po-1",
    poNumber: "PO-MN-2041",
    supplier: "Deccan Fresh Poultry",
    itemsSummary: "12 kg Country Chicken, 10 kg Goat Mutton",
    amount: 12440,
    status: "Pending Delivery",
    date: "Today, 07:30 AM",
  },
  {
    id: "po-2",
    poNumber: "PO-MN-2040",
    supplier: "Krishna Homemade Foods",
    itemsSummary: "10 L Ulavacharu Paste, 5 kg Kandi Podi",
    amount: 4650,
    status: "Pending Delivery",
    date: "Today, 09:15 AM",
  },
  {
    id: "po-3",
    poNumber: "PO-MN-2039",
    supplier: "Godavari Agro Traders",
    itemsSummary: "50 kg Aged Basmati Rice, 25 kg Chitti Muthyalu",
    amount: 9000,
    status: "Received",
    date: "Yesterday",
  },
  {
    id: "po-4",
    poNumber: "PO-MN-2038",
    supplier: "EcoPack F&B Supplies",
    itemsSummary: "300 pcs Biryani Boxes, 500 pcs Gravy Cups",
    amount: 5550,
    status: "Received",
    date: "2 days ago",
  },
];

// Deterministic recipe BOM estimation per menu item
function buildRecipeForProduct(p: MenuProductSummary) {
  const name = p.name.toLowerCase();
  if (name.includes("mutton") && name.includes("biryani")) {
    return {
      ingredients: "180g Goat Mutton, 160g Basmati Rice, 40g Gongura/Spices, 20ml Ghee",
      foodCost: 138,
      packagingCost: 16,
    };
  }
  if (name.includes("biryani") || name.includes("pulao")) {
    const isVeg = (p.veg_status ?? "Veg").toLowerCase() === "veg";
    return {
      ingredients: isVeg
        ? "160g Basmati/Pulao Rice, 120g Paneer/Vankaya, 30ml Ulavacharu/Ghee"
        : "180g Chicken/Seafood, 160g Rice, 35ml Ulavacharu/Ghee & Spices",
      foodCost: isVeg ? 78 : 104,
      packagingCost: 15,
    };
  }
  if (name.includes("vepudu") || name.includes("fry") || name.includes("roast")) {
    return {
      ingredients: "200g Primary Protein/Paneer, 25g Guntur Chilli Paste, 20ml Groundnut Oil",
      foodCost: Math.round(p.price * 0.31),
      packagingCost: 9,
    };
  }
  if (name.includes("bhojanam") || name.includes("thali")) {
    return {
      ingredients: "250g Sona Masoori, Dal, 3 Curries, Curd, Sweet, Ghee & Banana Leaf",
      foodCost: Math.round(p.price * 0.29),
      packagingCost: 18,
    };
  }
  return {
    ingredients: "Standard kitchen recipe BOM & accompaniments",
    foodCost: Math.round(p.price * 0.27),
    packagingCost: 8,
  };
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function InventoryWorkbench({
  products,
}: {
  products: MenuProductSummary[];
}) {
  const [materials, setMaterials] = useState<RawMaterial[]>(INITIAL_MATERIALS);
  const [pos, setPos] = useState<PurchaseOrder[]>(INITIAL_POS);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low">("all");
  const [addingItem, setAddingItem] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState<RawMaterial["category"]>("Spices & Produce");
  const [newUnit, setNewUnit] = useState("kg");
  const [newStock, setNewStock] = useState("10");
  const [newMin, setNewMin] = useState("5");
  const [newCost, setNewCost] = useState("150");
  const [newSupplier, setNewSupplier] = useState("Local Vendor");

  const lowStockCount = useMemo(
    () => materials.filter((m) => m.stock <= m.minLevel).length,
    [materials],
  );
  const totalInventoryValue = useMemo(
    () => materials.reduce((s, m) => s + m.stock * m.costPerUnit, 0),
    [materials],
  );

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (catFilter !== "all" && m.category !== catFilter) return false;
      if (stockFilter === "low" && m.stock > m.minLevel) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q) ||
        m.supplier.toLowerCase().includes(q)
      );
    });
  }, [materials, search, catFilter, stockFilter]);

  const recipes = useMemo(() => {
    return products.map((p) => {
      const r = buildRecipeForProduct(p);
      const totalCost = r.foodCost + r.packagingCost;
      const margin = p.price - totalCost;
      const costPct = p.price > 0 ? Math.round((totalCost / p.price) * 100) : 0;
      return {
        ...p,
        ...r,
        totalCost,
        margin,
        costPct,
      };
    });
  }, [products]);

  const avgFoodCostPct = useMemo(() => {
    if (recipes.length === 0) return 0;
    return Math.round(
      recipes.reduce((s, r) => s + r.costPct, 0) / recipes.length,
    );
  }, [recipes]);

  function adjustStock(id: string, delta: number) {
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, stock: Math.max(0, Number((m.stock + delta).toFixed(1))) }
          : m,
      ),
    );
  }

  function handleAddMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const item: RawMaterial = {
      id: `rm-${Date.now()}`,
      sku: `RM-${Math.floor(100 + Math.random() * 900)}`,
      name: newName.trim(),
      category: newCat,
      stock: Number(newStock) || 0,
      unit: newUnit.trim() || "kg",
      minLevel: Number(newMin) || 5,
      costPerUnit: Number(newCost) || 100,
      supplier: newSupplier.trim() || "Direct Vendor",
    };
    setMaterials((prev) => [item, ...prev]);
    setNewName("");
    setAddingItem(false);
  }

  function receivePo(id: string) {
    setPos((prev) =>
      prev.map((po) => (po.id === id ? { ...po, status: "Received" } : po)),
    );
    // Also bump low stock items to healthy
    setMaterials((prev) =>
      prev.map((m) =>
        m.stock <= m.minLevel ? { ...m, stock: m.minLevel + 12 } : m,
      ),
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Raw Materials Tracked</span>
              <Boxes className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {materials.length}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Across 5 kitchen store categories
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Low Stock Alerts</span>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {lowStockCount}
              </span>
              {lowStockCount > 0 && (
                <span className="text-xs font-medium text-amber-700">
                  Needs reorder
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Below minimum par stock level
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Current Stock Valuation</span>
              <IndianRupee className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">
              {inr(totalInventoryValue)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Weighted average purchase cost
            </div>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="pt-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Avg Recipe Food Cost</span>
              <ChefHat className="h-3.5 w-3.5" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">
                {avgFoodCostPct}%
              </span>
              <span className="text-xs text-emerald-700">Target &lt; 34%</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Across {recipes.length} active menu recipes
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="stock">
              Raw Material Stock ({materials.length})
            </TabsTrigger>
            <TabsTrigger value="recipes">
              Recipes &amp; Food Cost ({recipes.length})
            </TabsTrigger>
            <TabsTrigger value="purchasing">
              Suppliers &amp; POs ({pos.length})
            </TabsTrigger>
          </TabsList>

          <Button size="sm" onClick={() => setAddingItem((v) => !v)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Raw Material
          </Button>
        </div>

        {addingItem && (
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Add Raw Material to Store Ledger</CardTitle>
              <CardDescription className="text-xs">
                Set opening stock, unit, and minimum par level for low-stock alerts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleAddMaterial}
                className="grid gap-3 sm:grid-cols-6 sm:items-end"
              >
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Material Name</Label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Guntur Chilli Powder"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Category</Label>
                  <select
                    value={newCat}
                    onChange={(e) =>
                      setNewCat(e.target.value as RawMaterial["category"])
                    }
                    className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs"
                  >
                    <option value="Grains & Pulses">Grains &amp; Pulses</option>
                    <option value="Meat & Seafood">Meat &amp; Seafood</option>
                    <option value="Spices & Produce">Spices &amp; Produce</option>
                    <option value="Dairy & Oils">Dairy &amp; Oils</option>
                    <option value="Packaging">Packaging</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Stock &amp; Unit</Label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      value={newStock}
                      onChange={(e) => setNewStock(e.target.value)}
                      className="w-16"
                    />
                    <Input
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                      placeholder="kg"
                      className="w-14"
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Cost / Unit (₹)</Label>
                  <Input
                    type="number"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddingItem(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* TAB 1: Raw Materials */}
        <TabsContent value="stock" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                "all",
                "Grains & Pulses",
                "Meat & Seafood",
                "Spices & Produce",
                "Dairy & Oils",
                "Packaging",
              ].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCatFilter(c)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    catFilter === c
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c === "all" ? "All Categories" : c}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setStockFilter((s) => (s === "low" ? "all" : "low"))
                }
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                  stockFilter === "low"
                    ? "border-amber-500 bg-amber-500/10 text-amber-800"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Low Stock Only ({lowStockCount})
              </button>
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search ingredient, SKU…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient / Material</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">In Stock</TableHead>
                    <TableHead className="text-right">Min Par</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Stock Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Quick Adjust</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map((m) => {
                    const isLow = m.stock <= m.minLevel;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="font-medium">{m.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {m.sku} · {m.supplier}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-normal">
                            {m.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {m.stock} {m.unit}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                          {m.minLevel} {m.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          ₹{m.costPerUnit}/{m.unit}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {inr(m.stock * m.costPerUnit)}
                        </TableCell>
                        <TableCell>
                          {isLow ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
                              <AlertTriangle className="h-3 w-3" /> Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" /> Healthy
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => adjustStock(m.id, -1)}
                              title="Record 1 unit consumption / wastage"
                            >
                              -1 {m.unit}
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => adjustStock(m.id, 5)}
                              title="Quick restock +5 units"
                            >
                              <PackagePlus className="mr-1 h-3 w-3" />
                              +5
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Recipe BOM & Food Costing */}
        <TabsContent value="recipes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Recipe Bill of Materials (BOM) &amp; Margin Analysis
              </CardTitle>
              <CardDescription>
                Auto-deducts raw material inventory per order sold and tracks dish-level gross profitability.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dish</TableHead>
                    <TableHead>Recipe BOM (Per Portion)</TableHead>
                    <TableHead className="text-right">Raw Cost</TableHead>
                    <TableHead className="text-right">Packing</TableHead>
                    <TableHead className="text-right">Menu Price</TableHead>
                    <TableHead className="text-right">Food Cost %</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-right">30d Sold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipes.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          {r.code && (
                            <span className="rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-[11px] text-muted-foreground">
                              {r.code}
                            </span>
                          )}
                          <span>{r.name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {r.category}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs text-xs text-muted-foreground">
                        {r.ingredients}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₹{r.foodCost}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        ₹{r.packagingCost}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        ₹{r.price}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
                            r.costPct <= 33
                              ? "bg-emerald-500/10 text-emerald-700"
                              : r.costPct <= 38
                                ? "bg-amber-500/10 text-amber-800"
                                : "bg-rose-500/10 text-rose-700",
                          )}
                        >
                          {r.costPct}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-emerald-700">
                        +₹{r.margin}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {r.sold30d}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Suppliers & POs */}
        <TabsContent value="purchasing" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Purchase Orders &amp; Vendor Deliveries
              </CardTitle>
              <CardDescription>
                Receive supplier deliveries to automatically replenish raw material stock.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Vendor / Supplier</TableHead>
                    <TableHead>Items Ordered</TableHead>
                    <TableHead>Ordered At</TableHead>
                    <TableHead className="text-right">PO Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pos.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="tabular-nums text-xs font-semibold">
                        {po.poNumber}
                      </TableCell>
                      <TableCell className="font-medium">{po.supplier}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {po.itemsSummary}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {po.date}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {inr(po.amount)}
                      </TableCell>
                      <TableCell>
                        {po.status === "Received" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700">
                            Received in Store
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-700">
                            <Truck className="mr-1 h-3 w-3" />
                            Pending Delivery
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {po.status === "Pending Delivery" ? (
                          <Button
                            size="xs"
                            onClick={() => receivePo(po.id)}
                          >
                            Mark Received &amp; Restock
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Stock updated
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
