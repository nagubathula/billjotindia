"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole, getDefaultOutletForRestaurant } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

// ===========================================================================
// Categories
// ===========================================================================

export async function createCategoryAction(slug: string, formData: FormData): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getDefaultOutletForRestaurant(restaurant.id);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const name = String(formData.get("name") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim() || null;
  if (!name) return { ok: false, error: "Enter a category name." };

  const admin = createAdminClient();

  // Default sort_order: max + 10 so new categories land at the end.
  const { data: maxRow } = await admin
    .from("categories")
    .select("sort_order")
    .eq("outlet_id", outlet.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 0) + 10;

  const { error } = await admin.from("categories").insert({
    outlet_id: outlet.id,
    name,
    emoji,
    sort_order: nextSort,
    status: "active",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/r/${slug}/admin/menu`);
  return { ok: true };
}

export async function toggleCategoryStatusAction(
  slug: string,
  categoryId: number,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { data: cat } = await admin
    .from("categories")
    .select("id, status")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat) return { ok: false, error: "Category not found." };

  const newStatus = cat.status === "active" ? "inactive" : "active";
  const { error } = await admin
    .from("categories")
    .update({ status: newStatus })
    .eq("id", categoryId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/r/${slug}/admin/menu`);
  return { ok: true };
}

// ===========================================================================
// Products
// ===========================================================================

export async function createProductAction(slug: string, formData: FormData): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getDefaultOutletForRestaurant(restaurant.id);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const gst_rate = Number(formData.get("gst_rate") ?? 5);
  const veg_status = String(formData.get("veg_status") ?? "Veg");
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) return { ok: false, error: "Enter a product name." };
  if (!category) return { ok: false, error: "Pick a category." };
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Enter a valid price." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("products").insert({
    outlet_id: outlet.id,
    name,
    category,
    price,
    gst_rate,
    veg_status,
    description,
    status: "active",
    has_toppings: false,
    has_addons: false,
    is_kot_required: true,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/r/${slug}/admin/menu`);
  revalidatePath(`/r/${slug}/pos`);
  revalidatePath(`/r/${slug}`);
  return { ok: true };
}

export async function updateProductAction(slug: string, formData: FormData): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const id = Number(formData.get("id") ?? 0);
  if (!id) return { ok: false, error: "Missing product id." };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const gst_rate = Number(formData.get("gst_rate") ?? 5);
  const veg_status = String(formData.get("veg_status") ?? "Veg");
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name || !category || !Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Check the fields." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({ name, category, price, gst_rate, veg_status, description })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/r/${slug}/admin/menu`);
  revalidatePath(`/r/${slug}/pos`);
  revalidatePath(`/r/${slug}`);
  return { ok: true };
}

export async function toggleProductStatusAction(
  slug: string,
  productId: number,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();
  const { data: p } = await admin
    .from("products")
    .select("id, status")
    .eq("id", productId)
    .maybeSingle();
  if (!p) return { ok: false, error: "Product not found." };

  const newStatus = p.status === "active" ? "inactive" : "active";
  const { error } = await admin
    .from("products")
    .update({ status: newStatus })
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/r/${slug}/admin/menu`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}
