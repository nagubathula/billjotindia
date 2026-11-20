import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductConfig } from "@/lib/types";

export const MATERIAL_CATEGORIES = [
  { value: "produce", label: "Fresh Produce" },
  { value: "meat_seafood", label: "Meat & Seafood" },
  { value: "dairy_oils", label: "Dairy & Oils" },
  { value: "grocery", label: "Grains & Grocery" },
  { value: "spices", label: "Spices & Dry Goods" },
  { value: "packaging", label: "Packaging & Disposables" },
  { value: "beverages", label: "Beverages" },
  { value: "other", label: "Other" },
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number]["value"];

export const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> =
  Object.fromEntries(
    MATERIAL_CATEGORIES.map((c) => [c.value, c.label]),
  ) as Record<MaterialCategory, string>;

export const MATERIAL_UNITS = [
  "kg",
  "g",
  "L",
  "ml",
  "pcs",
  "pkt",
  "rolls",
] as const;

export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const round3 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;

export function computeWeightedAverageCost(
  prevStock: number,
  prevCost: number,
  addedQty: number,
  addedUnitCost: number,
): number {
  const s = Math.max(0, Number(prevStock) || 0);
  const c = Math.max(0, Number(prevCost) || 0);
  const q = Math.max(0, Number(addedQty) || 0);
  const uc = Math.max(0, Number(addedUnitCost) || 0);
  if (q <= 0) return round2(c);
  if (s <= 0) return round2(uc);
  return round2((s * c + q * uc) / (s + q));
}

export function computeRecipeLineCost(
  quantityPerUnit: number,
  wastagePct: number,
  materialUnitCost: number,
): number {
  const qty = Math.max(0, Number(quantityPerUnit) || 0);
  const wastage = Math.min(100, Math.max(0, Number(wastagePct) || 0));
  const unitCost = Math.max(0, Number(materialUnitCost) || 0);
  return round2(qty * (1 + wastage / 100) * unitCost);
}

export function computeDishFoodCost(
  recipeLines: Array<{
    quantityPerUnit: number;
    wastagePct: number;
    materialUnitCost: number;
  }>,
  sellingPrice: number,
): { foodCost: number; margin: number; foodCostPct: number } {
  const rawCost = recipeLines.reduce((sum, l) => {
    const qty = Math.max(0, Number(l.quantityPerUnit) || 0);
    const wastage = Math.min(100, Math.max(0, Number(l.wastagePct) || 0));
    const unitCost = Math.max(0, Number(l.materialUnitCost) || 0);
    return sum + qty * (1 + wastage / 100) * unitCost;
  }, 0);
  const foodCost = round2(rawCost);
  const price = Math.max(0, Number(sellingPrice) || 0);
  const margin = round2(price - foodCost);
  const foodCostPct = price > 0 ? Math.round((foodCost / price) * 100) : 0;
  return { foodCost, margin, foodCostPct };
}

export function computeOrderMaterialDeductions(
  orderItems: Array<{ productId: string; quantity: number }>,
  recipesByProduct: Map<
    string,
    Array<{ materialId: string; quantityPerUnit: number; wastagePct: number }>
  >,
): Array<{ materialId: string; totalRequired: number }> {
  const totals = new Map<string, number>();

  for (const item of orderItems) {
    const qty = Math.max(0, Number(item.quantity) || 0);
    if (qty <= 0 || !item.productId) continue;
    const recipe = recipesByProduct.get(item.productId);
    if (!recipe || recipe.length === 0) continue;

    for (const line of recipe) {
      const perUnit = Math.max(0, Number(line.quantityPerUnit) || 0);
      const wastage = Math.min(100, Math.max(0, Number(line.wastagePct) || 0));
      const req = qty * perUnit * (1 + wastage / 100);
      if (req <= 0) continue;
      totals.set(line.materialId, (totals.get(line.materialId) ?? 0) + req);
    }
  }

  return [...totals.entries()]
    .map(([materialId, raw]) => ({
      materialId,
      totalRequired: round3(raw),
    }))
    .filter((entry) => entry.totalRequired > 0)
    .sort((a, b) => a.materialId.localeCompare(b.materialId));
}

function normalizeLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function matchPoItemToMaterial<
  T extends { id: string; sku: string; name: string },
>(itemName: string, materials: T[]): T | null {
  const norm = normalizeLabel(itemName);
  if (!norm) return null;

  // 1. Exact SKU token check (e.g., "RM-GR01 - Aged Basmati" or "RM-GR01")
  for (const m of materials) {
    const skuNorm = normalizeLabel(m.sku);
    if (
      skuNorm &&
      (norm === skuNorm ||
        norm.startsWith(`${skuNorm} `) ||
        norm.startsWith(`${skuNorm}-`) ||
        norm.startsWith(`${skuNorm}:`))
    ) {
      return m;
    }
  }

  // 2. Exact normalized material name match
  for (const m of materials) {
    if (normalizeLabel(m.name) === norm) return m;
  }

  // 3. Containment match (prefer longest matching material name, ignoring parenthetical pack notes)
  const strippedNorm = normalizeLabel(itemName.replace(/\([^)]*\)/g, " "));
  const sorted = [...materials].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    const matNorm = normalizeLabel(m.name);
    if (
      matNorm.length >= 4 &&
      (norm.includes(matNorm) ||
        matNorm.includes(norm) ||
        (strippedNorm.length >= 4 &&
          (strippedNorm.includes(matNorm) || matNorm.includes(strippedNorm))))
    ) {
      return m;
    }
  }

  return null;
}

async function generateNextMaterialSku(
  admin: ReturnType<typeof createAdminClient>,
  restaurantId: string,
): Promise<string> {
  const { data } = await admin
    .from("inventory_materials")
    .select("sku")
    .eq("restaurant_id", restaurantId);
  let maxSeq = 0;
  for (const row of data ?? []) {
    const m = /^RM-(\d+)$/i.exec(row.sku.trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }
  return `RM-${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function applyPurchaseOrderGrnToInventory(params: {
  restaurantId: string;
  outletId?: string | null;
  vendorId?: string | null;
  poId: string;
  poNumber: string;
  items: Array<{ name: string; unit: string; qty: number; unit_cost: number }>;
  createdBy?: string | null;
}): Promise<{ applied: number; createdMaterials: number }> {
  const admin = createAdminClient();

  const [{ data: existingMovements }, { data: materialsData }] = await Promise.all([
    admin
      .from("inventory_stock_movements")
      .select("material_id")
      .eq("reference_po_id", params.poId)
      .eq("movement_type", "purchase_grn"),
    admin
      .from("inventory_materials")
      .select("id, sku, name, current_stock, cost_per_unit")
      .eq("restaurant_id", params.restaurantId),
  ]);

  const alreadyApplied = new Set(
    (existingMovements ?? []).map((m) => m.material_id),
  );
  const materials = (materialsData ?? []).map((m) => ({
    id: m.id,
    sku: m.sku,
    name: m.name,
    currentStock: Number(m.current_stock ?? 0),
    costPerUnit: Number(m.cost_per_unit ?? 0),
  }));

  let applied = 0;
  let createdMaterials = 0;

  for (const item of params.items ?? []) {
    const qty = round3(Number(item.qty ?? 0));
    const unitCost = round2(Number(item.unit_cost ?? 0));
    const itemName = String(item.name ?? "").trim();
    if (!itemName || qty <= 0) continue;

    let mat = matchPoItemToMaterial(itemName, materials);
    if (!mat) {
      const nextSku = await generateNextMaterialSku(admin, params.restaurantId);
      const { data: insertedMat, error: createErr } = await admin
        .from("inventory_materials")
        .insert({
          restaurant_id: params.restaurantId,
          outlet_id: params.outletId ?? null,
          vendor_id: params.vendorId ?? null,
          sku: nextSku,
          name: itemName.slice(0, 140),
          category: "grocery",
          unit: String(item.unit || "kg").trim().slice(0, 24) || "kg",
          current_stock: 0,
          reorder_level: 5,
          cost_per_unit: unitCost,
          status: "active",
        })
        .select("id, sku, name, current_stock, cost_per_unit")
        .single();

      if (createErr || !insertedMat) continue;
      mat = {
        id: insertedMat.id,
        sku: insertedMat.sku,
        name: insertedMat.name,
        currentStock: 0,
        costPerUnit: unitCost,
      };
      materials.push(mat);
      createdMaterials += 1;
    }

    if (alreadyApplied.has(mat.id)) continue;
    alreadyApplied.add(mat.id);

    const nextStock = round3(mat.currentStock + qty);
    const nextCost = computeWeightedAverageCost(
      mat.currentStock,
      mat.costPerUnit,
      qty,
      unitCost,
    );

    const { error: updErr } = await admin
      .from("inventory_materials")
      .update({
        current_stock: nextStock,
        cost_per_unit: nextCost,
      })
      .eq("id", mat.id);

    if (updErr) continue;

    await admin.from("inventory_stock_movements").insert({
      restaurant_id: params.restaurantId,
      outlet_id: params.outletId ?? null,
      material_id: mat.id,
      movement_type: "purchase_grn",
      quantity_delta: qty,
      stock_after: nextStock,
      unit_cost: unitCost,
      reference_po_id: params.poId,
      note: `GRN received (${params.poNumber})`,
      created_by: params.createdBy ?? null,
    });

    mat.currentStock = nextStock;
    mat.costPerUnit = nextCost;
    applied += 1;
  }

  return { applied, createdMaterials };
}

export async function deductOrderRecipeStock(params: {
  orderId: string;
  outletId: string;
}): Promise<{ deducted: number }> {
  try {
    const admin = createAdminClient();
    const { data: outlet } = await admin
      .from("outlets")
      .select("restaurant_id")
      .eq("id", params.outletId)
      .maybeSingle();
    if (!outlet) return { deducted: 0 };

    const [{ data: items }, { data: existingMovements }] = await Promise.all([
      admin
        .from("order_items")
        .select("quantity, product_config")
        .eq("order_id", params.orderId),
      admin
        .from("inventory_stock_movements")
        .select("material_id")
        .eq("reference_order_id", params.orderId)
        .eq("movement_type", "order_consumption"),
    ]);

    const orderItems = (items ?? [])
      .map((row) => {
        const cfg = row.product_config as unknown as ProductConfig | null;
        return {
          productId: typeof cfg?.product_id === "string" ? cfg.product_id : "",
          quantity: Number(row.quantity ?? 0),
        };
      })
      .filter((x) => Boolean(x.productId) && x.quantity > 0);

    if (orderItems.length === 0) return { deducted: 0 };

    const productIds = [...new Set(orderItems.map((i) => i.productId))];
    const { data: recipeRows } = await admin
      .from("product_recipes")
      .select("product_id, material_id, quantity_per_unit, wastage_pct")
      .eq("restaurant_id", outlet.restaurant_id)
      .in("product_id", productIds);

    if (!recipeRows || recipeRows.length === 0) return { deducted: 0 };

    const recipesByProduct = new Map<
      string,
      Array<{ materialId: string; quantityPerUnit: number; wastagePct: number }>
    >();
    for (const r of recipeRows) {
      const list = recipesByProduct.get(r.product_id) ?? [];
      list.push({
        materialId: r.material_id,
        quantityPerUnit: Number(r.quantity_per_unit ?? 0),
        wastagePct: Number(r.wastage_pct ?? 0),
      });
      recipesByProduct.set(r.product_id, list);
    }

    const deductions = computeOrderMaterialDeductions(orderItems, recipesByProduct);
    if (deductions.length === 0) return { deducted: 0 };

    const alreadyDeducted = new Set(
      (existingMovements ?? []).map((m) => m.material_id),
    );
    const materialIds = deductions.map((d) => d.materialId);
    const { data: materials } = await admin
      .from("inventory_materials")
      .select("id, current_stock, cost_per_unit")
      .in("id", materialIds);

    const matMap = new Map(
      (materials ?? []).map((m) => [
        m.id,
        {
          stock: Number(m.current_stock ?? 0),
          cost: Number(m.cost_per_unit ?? 0),
        },
      ]),
    );

    let deducted = 0;
    for (const entry of deductions) {
      if (alreadyDeducted.has(entry.materialId)) continue;
      const mat = matMap.get(entry.materialId);
      if (!mat) continue;

      const nextStock = round3(Math.max(0, mat.stock - entry.totalRequired));
      const { error: updErr } = await admin
        .from("inventory_materials")
        .update({ current_stock: nextStock })
        .eq("id", entry.materialId);
      if (updErr) continue;

      const { error: movErr } = await admin
        .from("inventory_stock_movements")
        .insert({
          restaurant_id: outlet.restaurant_id,
          outlet_id: params.outletId,
          material_id: entry.materialId,
          movement_type: "order_consumption",
          quantity_delta: -entry.totalRequired,
          stock_after: nextStock,
          unit_cost: mat.cost,
          reference_order_id: params.orderId,
          note: "Auto-deducted from order BOM",
        });

      if (!movErr) deducted += 1;
    }

    return { deducted };
  } catch (err) {
    console.error("[deductOrderRecipeStock] non-fatal error:", err);
    return { deducted: 0 };
  }
}
