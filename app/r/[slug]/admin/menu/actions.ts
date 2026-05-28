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

  const groupIds = parseGroupIds(formData.get("group_ids"));

  const admin = createAdminClient();
  const { data: created, error } = await admin
    .from("products")
    .insert({
      outlet_id: outlet.id,
      name,
      category,
      price,
      gst_rate,
      veg_status,
      description,
      status: "active",
      has_toppings: false,
      has_addons: groupIds.length > 0,
      is_kot_required: true,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? "Insert failed." };

  const linkErr = await reconcileProductGroups(admin, created.id, groupIds, outlet.id);
  if (linkErr) return { ok: false, error: linkErr };

  revalidatePath(`/r/${slug}/admin/menu`);
  revalidatePath(`/r/${slug}/pos`);
  revalidatePath(`/r/${slug}`);
  return { ok: true };
}

export async function updateProductAction(slug: string, formData: FormData): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getDefaultOutletForRestaurant(restaurant.id);
  if (!outlet) return { ok: false, error: "No outlet configured." };

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

  const groupIds = parseGroupIds(formData.get("group_ids"));

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({
      name,
      category,
      price,
      gst_rate,
      veg_status,
      description,
      has_addons: groupIds.length > 0,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const linkErr = await reconcileProductGroups(admin, id, groupIds, outlet.id);
  if (linkErr) return { ok: false, error: linkErr };

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

// ===========================================================================
// Customization groups (shared add-on sets attachable to products)
// ===========================================================================

type Admin = ReturnType<typeof createAdminClient>;

function parseGroupIds(raw: FormDataEntryValue | null): number[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

// Replaces a product's group links. Only groups belonging to the product's
// outlet are linked, so a forged id can't borrow another tenant's groups.
async function reconcileProductGroups(
  admin: Admin,
  productId: number,
  groupIds: number[],
  outletId: number,
): Promise<string | null> {
  await admin.from("product_customizations").delete().eq("product_id", productId);
  if (groupIds.length === 0) return null;

  const { data: owned } = await admin
    .from("customization_groups")
    .select("id")
    .eq("outlet_id", outletId)
    .in("id", groupIds);
  const validIds = new Set((owned ?? []).map((g) => g.id));

  const rows = groupIds
    .filter((id) => validIds.has(id))
    .map((id, i) => ({
      product_id: productId,
      group_id: id,
      sort_order: (i + 1) * 10,
    }));
  if (rows.length === 0) return null;

  const { error } = await admin.from("product_customizations").insert(rows);
  return error ? error.message : null;
}

type GroupOptionInput = { name: string; price: number };

function parseOptions(raw: FormDataEntryValue | null): GroupOptionInput[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((o) => ({
        name: String(o?.name ?? "").trim(),
        price: Number(o?.price ?? 0),
      }))
      .filter((o) => o.name && Number.isFinite(o.price) && o.price >= 0);
  } catch {
    return [];
  }
}

export async function saveCustomizationGroupAction(
  slug: string,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getDefaultOutletForRestaurant(restaurant.id);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const id = Number(formData.get("id") ?? 0) || null;
  const displayName = String(formData.get("display_name") ?? "").trim();
  const selectionType =
    String(formData.get("selection_type") ?? "single") === "multi" ? "multi" : "single";
  const isRequired = String(formData.get("is_required") ?? "") === "true";
  const options = parseOptions(formData.get("options"));

  if (!displayName) return { ok: false, error: "Enter a group name." };
  if (options.length === 0) return { ok: false, error: "Add at least one option." };

  const name = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const admin = createAdminClient();

  let groupId = id;
  if (groupId) {
    // Ensure the group belongs to this outlet before editing it.
    const { data: existing } = await admin
      .from("customization_groups")
      .select("id")
      .eq("id", groupId)
      .eq("outlet_id", outlet.id)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Group not found." };

    const { error } = await admin
      .from("customization_groups")
      .update({
        display_name: displayName,
        name,
        selection_type: selectionType,
        is_required: isRequired,
      })
      .eq("id", groupId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data: maxRow } = await admin
      .from("customization_groups")
      .select("sort_order")
      .eq("outlet_id", outlet.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSort = (maxRow?.sort_order ?? 0) + 10;

    const { data: created, error } = await admin
      .from("customization_groups")
      .insert({
        outlet_id: outlet.id,
        display_name: displayName,
        name,
        selection_type: selectionType,
        is_required: isRequired,
        sort_order: nextSort,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "Insert failed." };
    groupId = created.id;
  }

  // Options have no inbound FKs (order snapshots live in product_config), so
  // replacing them wholesale on each save is safe and keeps the form simple.
  await admin.from("customization_options").delete().eq("group_id", groupId);
  const { error: optErr } = await admin.from("customization_options").insert(
    options.map((o, i) => ({
      group_id: groupId,
      name: o.name,
      price: o.price,
      sort_order: (i + 1) * 10,
      status: "active",
    })),
  );
  if (optErr) return { ok: false, error: optErr.message };

  revalidatePath(`/r/${slug}/admin/menu`);
  revalidatePath(`/r/${slug}/pos`);
  revalidatePath(`/r/${slug}`);
  return { ok: true };
}

export async function toggleCustomizationGroupStatusAction(
  slug: string,
  groupId: number,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getDefaultOutletForRestaurant(restaurant.id);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const admin = createAdminClient();
  const { data: group } = await admin
    .from("customization_groups")
    .select("id, status")
    .eq("id", groupId)
    .eq("outlet_id", outlet.id)
    .maybeSingle();
  if (!group) return { ok: false, error: "Group not found." };

  const newStatus = group.status === "active" ? "inactive" : "active";
  const { error } = await admin
    .from("customization_groups")
    .update({ status: newStatus })
    .eq("id", groupId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/menu`);
  revalidatePath(`/r/${slug}/pos`);
  revalidatePath(`/r/${slug}`);
  return { ok: true };
}
