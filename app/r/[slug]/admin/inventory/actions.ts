"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { MATERIAL_CATEGORIES, type MaterialCategory } from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const round3 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 1000) / 1000;
const round4 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 10000) / 10000;

async function invContext(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  const { user, role } = await requireRole(["admin", "manager"], {
    restaurantId: restaurant.id,
    redirectTo: `/r/${slug}/admin/inventory`,
  });
  return { restaurant, user, role };
}

async function nextMaterialSku(
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

export async function saveMaterialAction(
  slug: string,
  input: {
    id?: string | null;
    outletId?: string | null;
    vendorId?: string | null;
    sku?: string | null;
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    reorderLevel: number;
    costPerUnit: number;
    status?: string;
  },
): Promise<Result> {
  const ctx = await invContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };

  const name = input.name.trim();
  if (!name || name.length > 140) {
    return { ok: false, error: "Enter a material name (up to 140 characters)." };
  }
  const validCat = MATERIAL_CATEGORIES.some((c) => c.value === input.category);
  if (!validCat) {
    return { ok: false, error: "Choose a valid material category." };
  }
  const unit = input.unit.trim().slice(0, 24) || "kg";
  const currentStock = Math.max(0, round3(Number(input.currentStock) || 0));
  const reorderLevel = Math.max(0, round3(Number(input.reorderLevel) || 0));
  const costPerUnit = Math.max(0, round2(Number(input.costPerUnit) || 0));
  const status = input.status === "inactive" ? "inactive" : "active";
  const cleanSku = input.sku?.trim().toUpperCase().slice(0, 32) || "";

  let vendorId: string | null = null;
  if (input.vendorId && input.vendorId !== "__none__") {
    if (!isUuid(input.vendorId)) return { ok: false, error: "Invalid supplier." };
    vendorId = input.vendorId;
  }

  let outletId: string | null = null;
  if (input.outletId && input.outletId !== "__all__") {
    if (!isUuid(input.outletId)) return { ok: false, error: "Invalid outlet." };
    outletId = input.outletId;
  }

  const admin = createAdminClient();

  if (input.id) {
    if (!isUuid(input.id)) return { ok: false, error: "Material not found." };
    const { data: existing } = await admin
      .from("inventory_materials")
      .select("id, sku, current_stock")
      .eq("id", input.id)
      .eq("restaurant_id", ctx.restaurant.id)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Material not found." };

    const { error } = await admin
      .from("inventory_materials")
      .update({
        outlet_id: outletId,
        vendor_id: vendorId,
        sku: cleanSku || existing.sku,
        name,
        category: input.category as MaterialCategory,
        unit,
        current_stock: currentStock,
        reorder_level: reorderLevel,
        cost_per_unit: costPerUnit,
        status,
      })
      .eq("id", existing.id)
      .eq("restaurant_id", ctx.restaurant.id);

    if (error) {
      if (error.code === "23505") {
        return { ok: false, error: "Another material already uses that SKU." };
      }
      return { ok: false, error: error.message };
    }

    const delta = round3(currentStock - Number(existing.current_stock ?? 0));
    if (Math.abs(delta) >= 0.001) {
      await admin.from("inventory_stock_movements").insert({
        restaurant_id: ctx.restaurant.id,
        outlet_id: outletId,
        material_id: existing.id,
        movement_type: "manual_adjustment",
        quantity_delta: delta,
        stock_after: currentStock,
        unit_cost: costPerUnit,
        note: "Adjusted via material edit",
        created_by: ctx.user.email ?? ctx.role,
      });
    }
  } else {
    const sku = cleanSku || (await nextMaterialSku(admin, ctx.restaurant.id));
    const { data: inserted, error } = await admin
      .from("inventory_materials")
      .insert({
        restaurant_id: ctx.restaurant.id,
        outlet_id: outletId,
        vendor_id: vendorId,
        sku,
        name,
        category: input.category as MaterialCategory,
        unit,
        current_stock: currentStock,
        reorder_level: reorderLevel,
        cost_per_unit: costPerUnit,
        status,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      if (error?.code === "23505") {
        return { ok: false, error: "SKU already exists in this restaurant." };
      }
      return { ok: false, error: error?.message ?? "Failed to create material." };
    }

    if (currentStock > 0) {
      await admin.from("inventory_stock_movements").insert({
        restaurant_id: ctx.restaurant.id,
        outlet_id: outletId,
        material_id: inserted.id,
        movement_type: "opening",
        quantity_delta: currentStock,
        stock_after: currentStock,
        unit_cost: costPerUnit,
        note: "Opening stock balance",
        created_by: ctx.user.email ?? ctx.role,
      });
    }
  }

  revalidatePath(`/r/${slug}/admin/inventory`);
  return { ok: true };
}

export async function adjustMaterialStockAction(
  slug: string,
  input: {
    materialId: string;
    movementType: "manual_adjustment" | "wastage";
    quantityDelta: number;
    note?: string | null;
  },
): Promise<Result<{ nextStock: number }>> {
  const ctx = await invContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.materialId)) {
    return { ok: false, error: "Material not found." };
  }

  const rawDelta = round3(Number(input.quantityDelta) || 0);
  if (Math.abs(rawDelta) < 0.001) {
    return { ok: false, error: "Enter a non-zero quantity adjustment." };
  }

  const delta =
    input.movementType === "wastage" ? -Math.abs(rawDelta) : rawDelta;

  const admin = createAdminClient();
  const { data: mat } = await admin
    .from("inventory_materials")
    .select("id, outlet_id, current_stock, cost_per_unit")
    .eq("id", input.materialId)
    .eq("restaurant_id", ctx.restaurant.id)
    .maybeSingle();
  if (!mat) return { ok: false, error: "Material not found." };

  const curStock = Number(mat.current_stock ?? 0);
  const nextStock = round3(Math.max(0, curStock + delta));
  const appliedDelta = round3(nextStock - curStock);

  const { error: updErr } = await admin
    .from("inventory_materials")
    .update({ current_stock: nextStock })
    .eq("id", mat.id)
    .eq("restaurant_id", ctx.restaurant.id);
  if (updErr) return { ok: false, error: updErr.message };

  await admin.from("inventory_stock_movements").insert({
    restaurant_id: ctx.restaurant.id,
    outlet_id: mat.outlet_id,
    material_id: mat.id,
    movement_type:
      input.movementType === "wastage" ? "wastage" : "manual_adjustment",
    quantity_delta: appliedDelta,
    stock_after: nextStock,
    unit_cost: Number(mat.cost_per_unit ?? 0),
    note:
      input.note?.trim().slice(0, 200) ||
      (input.movementType === "wastage" ? "Kitchen wastage logged" : "Quick stock adjustment"),
    created_by: ctx.user.email ?? ctx.role,
  });

  revalidatePath(`/r/${slug}/admin/inventory`);
  return { ok: true, nextStock };
}

export async function deleteMaterialAction(
  slug: string,
  materialId: string,
): Promise<Result> {
  const ctx = await invContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(materialId)) return { ok: false, error: "Material not found." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("inventory_materials")
    .delete()
    .eq("id", materialId)
    .eq("restaurant_id", ctx.restaurant.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/inventory`);
  return { ok: true };
}

export async function saveProductRecipeAction(
  slug: string,
  input: {
    productId: string;
    lines: Array<{
      materialId: string;
      quantityPerUnit: number;
      wastagePct?: number;
    }>;
  },
): Promise<Result> {
  const ctx = await invContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(input.productId)) return { ok: false, error: "Product not found." };

  const admin = createAdminClient();
  const { data: prod } = await admin
    .from("products")
    .select("id, outlet_id")
    .eq("id", input.productId)
    .maybeSingle();
  if (!prod) return { ok: false, error: "Product not found." };

  const { data: outlet } = await admin
    .from("outlets")
    .select("restaurant_id")
    .eq("id", prod.outlet_id)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== ctx.restaurant.id) {
    return { ok: false, error: "Product does not belong to this restaurant." };
  }

  const deduped = new Map<
    string,
    { quantityPerUnit: number; wastagePct: number }
  >();
  for (const row of input.lines ?? []) {
    if (!isUuid(row.materialId)) continue;
    const qty = round4(Number(row.quantityPerUnit) || 0);
    if (qty <= 0) continue;
    const wastage = round2(Math.min(100, Math.max(0, Number(row.wastagePct ?? 0) || 0)));
    deduped.set(row.materialId, { quantityPerUnit: qty, wastagePct: wastage });
  }

  const { error: delErr } = await admin
    .from("product_recipes")
    .delete()
    .eq("product_id", prod.id)
    .eq("restaurant_id", ctx.restaurant.id);
  if (delErr) return { ok: false, error: delErr.message };

  if (deduped.size > 0) {
    const payload = [...deduped.entries()].map(([materialId, val]) => ({
      restaurant_id: ctx.restaurant.id,
      product_id: prod.id,
      material_id: materialId,
      quantity_per_unit: val.quantityPerUnit,
      wastage_pct: val.wastagePct,
    }));
    const { error: insErr } = await admin.from("product_recipes").insert(payload);
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath(`/r/${slug}/admin/inventory`);
  return { ok: true };
}
