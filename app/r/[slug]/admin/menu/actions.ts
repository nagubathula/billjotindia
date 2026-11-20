"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getSelectedOutlet } from "@/lib/outlet-context";
import { normalizeVegStatus, parseVariantPrices } from "@/lib/customizations";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

type Result = { ok: true } | { ok: false; error: string };

function revalidateMenuSurfaces(slug: string) {
  revalidatePath(`/r/${slug}/admin/menu`);
  revalidatePath(`/r/${slug}/admin/kitchen`);
  revalidatePath(`/r/${slug}/kitchen`);
  revalidatePath(`/r/${slug}/pos`);
  revalidatePath(`/r/${slug}`);
}

function slugifyName(displayName: string) {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ===========================================================================
// Categories
// ===========================================================================

export async function createCategoryAction(
  slug: string,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getSelectedOutlet(restaurant.id, slug);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a category name." };
  const rawStation = String(formData.get("station_id") ?? "").trim();
  const stationId = rawStation && rawStation !== "__none__" ? rawStation : null;

  const admin = createAdminClient();
  if (stationId) {
    const { data: stn } = await admin
      .from("kitchen_stations")
      .select("id")
      .eq("id", stationId)
      .eq("outlet_id", outlet.id)
      .maybeSingle();
    if (!stn) return { ok: false, error: "Selected kitchen station does not belong to this outlet." };
  }

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
    emoji: null,
    sort_order: nextSort,
    station_id: stationId,
    status: "active",
  });
  if (error) return { ok: false, error: error.message };
  revalidateMenuSurfaces(slug);
  return { ok: true };
}

export async function updateCategoryStationAction(
  slug: string,
  categoryId: string,
  stationId: string | null,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getSelectedOutlet(restaurant.id, slug);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const admin = createAdminClient();
  const cleanStation = stationId && stationId !== "__none__" ? stationId : null;
  if (cleanStation) {
    const { data: stn } = await admin
      .from("kitchen_stations")
      .select("id")
      .eq("id", cleanStation)
      .eq("outlet_id", outlet.id)
      .maybeSingle();
    if (!stn) return { ok: false, error: "Invalid station." };
  }

  const { error } = await admin
    .from("categories")
    .update({ station_id: cleanStation })
    .eq("id", categoryId)
    .eq("outlet_id", outlet.id);
  if (error) return { ok: false, error: error.message };
  revalidateMenuSurfaces(slug);
  return { ok: true };
}

export async function toggleCategoryStatusAction(
  slug: string,
  categoryId: string,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getSelectedOutlet(restaurant.id, slug);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const admin = createAdminClient();
  const { data: cat } = await admin
    .from("categories")
    .select("id, status")
    .eq("id", categoryId)
    .eq("outlet_id", outlet.id)
    .maybeSingle();
  if (!cat) return { ok: false, error: "Category not found." };

  const newStatus = cat.status === "active" ? "inactive" : "active";
  const { error } = await admin
    .from("categories")
    .update({ status: newStatus })
    .eq("id", categoryId)
    .eq("outlet_id", outlet.id);
  if (error) return { ok: false, error: error.message };
  revalidateMenuSurfaces(slug);
  return { ok: true };
}

// ===========================================================================
// Products
// ===========================================================================

type ProductGroupLinkInput = {
  group_id: string;
  is_required_override: boolean | null;
};

function parseProductGroups(
  rawGroups: FormDataEntryValue | null,
  rawGroupIds: FormDataEntryValue | null,
): ProductGroupLinkInput[] {
  if (typeof rawGroups === "string" && rawGroups.trim()) {
    try {
      const arr = JSON.parse(rawGroups);
      if (Array.isArray(arr)) {
        const seen = new Set<string>();
        const out: ProductGroupLinkInput[] = [];
        for (const item of arr) {
          const gid = String(item?.group_id ?? "").trim();
          if (!gid || seen.has(gid)) continue;
          seen.add(gid);
          const ov = item?.is_required_override;
          out.push({
            group_id: gid,
            is_required_override: typeof ov === "boolean" ? ov : null,
          });
        }
        return out;
      }
    } catch {
      // fall back to group_ids
    }
  }

  if (typeof rawGroupIds === "string" && rawGroupIds.trim()) {
    try {
      const arr = JSON.parse(rawGroupIds);
      if (Array.isArray(arr)) {
        return [...new Set(arr.map(String).filter(Boolean))].map((gid) => ({
          group_id: gid,
          is_required_override: null,
        }));
      }
    } catch {
      return [];
    }
  }

  return [];
}

type Admin = ReturnType<typeof createAdminClient>;

async function reconcileProductGroups(
  admin: Admin,
  productId: string,
  groups: ProductGroupLinkInput[],
  outletId: string,
): Promise<string | null> {
  await admin
    .from("product_customizations")
    .delete()
    .eq("product_id", productId);
  if (groups.length === 0) return null;

  const { data: owned } = await admin
    .from("customization_groups")
    .select("id")
    .eq("outlet_id", outletId)
    .in(
      "id",
      groups.map((g) => g.group_id),
    );
  const validIds = new Set((owned ?? []).map((g) => g.id));

  const rows = groups
    .filter((g) => validIds.has(g.group_id))
    .map((g, i) => ({
      product_id: productId,
      group_id: g.group_id,
      sort_order: (i + 1) * 10,
      is_required_override: g.is_required_override,
    }));
  if (rows.length === 0) return null;

  const { error } = await admin.from("product_customizations").insert(rows);
  return error ? error.message : null;
}

export async function createProductAction(
  slug: string,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getSelectedOutlet(restaurant.id, slug);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const gst_rate = Number(formData.get("gst_rate") ?? 5);
  const veg_status = String(formData.get("veg_status") ?? "Veg");
  const code = String(formData.get("code") ?? "").trim() || null;
  const hsn_code = String(formData.get("hsn_code") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const rawStation = String(formData.get("station_id") ?? "").trim();
  const station_id = rawStation && rawStation !== "__inherit__" ? rawStation : null;
  const is_kot_required = formData.get("is_kot_required") !== "false";

  if (!name) return { ok: false, error: "Enter a product name." };
  if (!category) return { ok: false, error: "Pick a category." };
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Enter a valid price." };
  }

  const productGroups = parseProductGroups(
    formData.get("product_groups"),
    formData.get("group_ids"),
  );

  const admin = createAdminClient();
  if (station_id) {
    const { data: stn } = await admin
      .from("kitchen_stations")
      .select("id")
      .eq("id", station_id)
      .eq("outlet_id", outlet.id)
      .maybeSingle();
    if (!stn) return { ok: false, error: "Selected kitchen station does not belong to this outlet." };
  }

  const { data: created, error } = await admin
    .from("products")
    .insert({
      outlet_id: outlet.id,
      name,
      category,
      price,
      gst_rate,
      veg_status,
      code,
      hsn_code,
      description,
      image_url,
      station_id,
      status: "active",
      has_toppings: false,
      has_addons: productGroups.length > 0,
      is_kot_required,
    })
    .select("id")
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }

  const linkErr = await reconcileProductGroups(
    admin,
    created.id,
    productGroups,
    outlet.id,
  );
  if (linkErr) return { ok: false, error: linkErr };

  revalidateMenuSurfaces(slug);
  return { ok: true };
}

export async function updateProductAction(
  slug: string,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getSelectedOutlet(restaurant.id, slug);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing product id." };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const price = Number(formData.get("price") ?? 0);
  const gst_rate = Number(formData.get("gst_rate") ?? 5);
  const veg_status = String(formData.get("veg_status") ?? "Veg");
  const code = String(formData.get("code") ?? "").trim() || null;
  const hsn_code = String(formData.get("hsn_code") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const rawStation = String(formData.get("station_id") ?? "").trim();
  const station_id = rawStation && rawStation !== "__inherit__" ? rawStation : null;
  const is_kot_required = formData.get("is_kot_required") !== "false";

  if (!name || !category || !Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Check the fields." };
  }

  const productGroups = parseProductGroups(
    formData.get("product_groups"),
    formData.get("group_ids"),
  );

  const admin = createAdminClient();
  if (station_id) {
    const { data: stn } = await admin
      .from("kitchen_stations")
      .select("id")
      .eq("id", station_id)
      .eq("outlet_id", outlet.id)
      .maybeSingle();
    if (!stn) return { ok: false, error: "Selected kitchen station does not belong to this outlet." };
  }

  const { error } = await admin
    .from("products")
    .update({
      name,
      category,
      price,
      gst_rate,
      veg_status,
      code,
      hsn_code,
      description,
      image_url,
      station_id,
      is_kot_required,
      has_addons: productGroups.length > 0,
    })
    .eq("id", id)
    .eq("outlet_id", outlet.id);
  if (error) return { ok: false, error: error.message };

  const linkErr = await reconcileProductGroups(
    admin,
    id,
    productGroups,
    outlet.id,
  );
  if (linkErr) return { ok: false, error: linkErr };

  revalidateMenuSurfaces(slug);
  return { ok: true };
}

export async function toggleProductStatusAction(
  slug: string,
  productId: string,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getSelectedOutlet(restaurant.id, slug);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const admin = createAdminClient();
  const { data: p } = await admin
    .from("products")
    .select("id, status")
    .eq("id", productId)
    .eq("outlet_id", outlet.id)
    .maybeSingle();
  if (!p) return { ok: false, error: "Product not found." };

  const newStatus = p.status === "active" ? "inactive" : "active";
  const { error } = await admin
    .from("products")
    .update({ status: newStatus })
    .eq("id", productId)
    .eq("outlet_id", outlet.id);
  if (error) return { ok: false, error: error.message };
  revalidateMenuSurfaces(slug);
  return { ok: true };
}

// ===========================================================================
// Customization groups (shared add-on sets attachable to products)
// ===========================================================================

type GroupOptionInput = {
  id: string | null;
  name: string;
  price: number;
  veg_status: "Veg" | "Egg" | "Non-Veg";
  is_default: boolean;
  max_qty: number;
  variant_prices: Record<string, number>;
  status: "active" | "inactive";
};

function parseOptions(
  raw: FormDataEntryValue | null,
  selectionType: "single" | "multi",
): GroupOptionInput[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((o) => {
        const rawQty = Math.floor(Number(o?.max_qty ?? 1));
        const maxQty =
          selectionType === "single"
            ? 1
            : Math.min(20, Math.max(1, Number.isFinite(rawQty) ? rawQty : 1));
        return {
          id: typeof o?.id === "string" && o.id ? o.id : null,
          name: String(o?.name ?? "").trim(),
          price: Number(o?.price ?? 0),
          veg_status: normalizeVegStatus(o?.veg_status),
          is_default: Boolean(o?.is_default),
          max_qty: maxQty,
          variant_prices: parseVariantPrices(o?.variant_prices),
          status: o?.status === "inactive" ? ("inactive" as const) : ("active" as const),
        };
      })
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

  const outlet = await getSelectedOutlet(restaurant.id, slug);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const id = String(formData.get("id") ?? "") || null;
  const displayName = String(formData.get("display_name") ?? "").trim();
  const selectionType: "single" | "multi" =
    String(formData.get("selection_type") ?? "single") === "multi"
      ? "multi"
      : "single";
  const rawRequired = String(formData.get("is_required") ?? "") === "true";

  const rawMin = Math.max(
    0,
    Math.floor(Number(formData.get("min_selections") ?? (rawRequired ? 1 : 0)) || 0),
  );
  const rawMaxField = String(formData.get("max_selections") ?? "").trim();
  const parsedMax =
    rawMaxField && Number.isFinite(Number(rawMaxField))
      ? Math.max(1, Math.floor(Number(rawMaxField)))
      : null;
  const rawFree = Math.max(
    0,
    Math.floor(Number(formData.get("free_selections") ?? 0) || 0),
  );

  const isRequired =
    selectionType === "single" ? rawRequired : rawRequired || rawMin > 0;
  const minSelections =
    selectionType === "single"
      ? isRequired
        ? 1
        : 0
      : isRequired
        ? Math.max(1, rawMin)
        : 0;
  const maxSelections =
    selectionType === "single"
      ? 1
      : parsedMax !== null
        ? Math.max(minSelections, parsedMax)
        : null;
  const freeSelections = selectionType === "single" ? 0 : rawFree;

  const options = parseOptions(formData.get("options"), selectionType);

  if (!displayName) return { ok: false, error: "Enter a group name." };
  if (options.length === 0) return { ok: false, error: "Add at least one option." };

  // Keep only one default on single-select groups
  if (selectionType === "single") {
    let seenDefault = false;
    for (const o of options) {
      if (o.is_default) {
        if (seenDefault) o.is_default = false;
        else seenDefault = true;
      }
    }
  }

  const name = slugifyName(displayName);
  const admin = createAdminClient();

  let groupId = id;
  if (groupId) {
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
        min_selections: minSelections,
        max_selections: maxSelections,
        free_selections: freeSelections,
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
        min_selections: minSelections,
        max_selections: maxSelections,
        free_selections: freeSelections,
        sort_order: nextSort,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !created) {
      return { ok: false, error: error?.message ?? "Insert failed." };
    }
    groupId = created.id;
  }

  // Non-destructive option upsert by id so existing channel_option_mappings
  // and order history UUIDs remain intact.
  const { data: existingOpts } = await admin
    .from("customization_options")
    .select("id")
    .eq("group_id", groupId);
  const existingIds = new Set((existingOpts ?? []).map((o) => o.id));
  const keptIds = new Set<string>();
  const inserts: Array<{
    group_id: string;
    name: string;
    price: number;
    veg_status: string;
    is_default: boolean;
    max_qty: number;
    variant_prices: Json;
    sort_order: number;
    status: string;
  }> = [];

  for (let i = 0; i < options.length; i += 1) {
    const o = options[i];
    const rowData = {
      group_id: groupId,
      name: o.name,
      price: o.price,
      veg_status: o.veg_status,
      is_default: o.is_default,
      max_qty: o.max_qty,
      variant_prices: o.variant_prices as Json,
      sort_order: (i + 1) * 10,
      status: o.status,
    };

    if (o.id && existingIds.has(o.id)) {
      keptIds.add(o.id);
      const { error: updErr } = await admin
        .from("customization_options")
        .update(rowData)
        .eq("id", o.id)
        .eq("group_id", groupId);
      if (updErr) return { ok: false, error: updErr.message };
    } else {
      inserts.push(rowData);
    }
  }

  const deletedIds = [...existingIds].filter((eid) => !keptIds.has(eid));
  if (deletedIds.length > 0) {
    const { error: delErr } = await admin
      .from("customization_options")
      .delete()
      .in("id", deletedIds)
      .eq("group_id", groupId);
    if (delErr) return { ok: false, error: delErr.message };
  }

  if (inserts.length > 0) {
    const { error: insErr } = await admin
      .from("customization_options")
      .insert(inserts);
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidateMenuSurfaces(slug);
  return { ok: true };
}

export async function toggleCustomizationGroupStatusAction(
  slug: string,
  groupId: string,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getSelectedOutlet(restaurant.id, slug);
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
    .eq("id", groupId)
    .eq("outlet_id", outlet.id);
  if (error) return { ok: false, error: error.message };

  revalidateMenuSurfaces(slug);
  return { ok: true };
}

export async function toggleCustomizationOptionStatusAction(
  slug: string,
  optionId: string,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const outlet = await getSelectedOutlet(restaurant.id, slug);
  if (!outlet) return { ok: false, error: "No outlet configured." };

  const admin = createAdminClient();
  const { data: option } = await admin
    .from("customization_options")
    .select("id, status, group_id")
    .eq("id", optionId)
    .maybeSingle();
  if (!option) return { ok: false, error: "Option not found." };

  const { data: group } = await admin
    .from("customization_groups")
    .select("id")
    .eq("id", option.group_id)
    .eq("outlet_id", outlet.id)
    .maybeSingle();
  if (!group) return { ok: false, error: "Option does not belong to this outlet." };

  const newStatus = option.status === "active" ? "inactive" : "active";
  const { error } = await admin
    .from("customization_options")
    .update({ status: newStatus })
    .eq("id", optionId);
  if (error) return { ok: false, error: error.message };

  revalidateMenuSurfaces(slug);
  return { ok: true };
}

export async function cloneCustomizationGroupToOutletsAction(
  slug: string,
  groupId: string,
  targetOutletIds: string[],
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const sourceOutlet = await getSelectedOutlet(restaurant.id, slug);
  if (!sourceOutlet) return { ok: false, error: "No outlet configured." };

  const cleanTargets = [
    ...new Set(targetOutletIds.map(String).filter((id) => id && id !== sourceOutlet.id)),
  ];
  if (cleanTargets.length === 0) {
    return { ok: false, error: "Select at least one destination outlet." };
  }

  const admin = createAdminClient();
  const [{ data: sourceGroup }, { data: sourceOptions }, { data: validTargets }] =
    await Promise.all([
      admin
        .from("customization_groups")
        .select("*")
        .eq("id", groupId)
        .eq("outlet_id", sourceOutlet.id)
        .maybeSingle(),
      admin
        .from("customization_options")
        .select("*")
        .eq("group_id", groupId)
        .order("sort_order"),
      admin
        .from("outlets")
        .select("id")
        .eq("restaurant_id", restaurant.id)
        .in("id", cleanTargets),
    ]);

  if (!sourceGroup) return { ok: false, error: "Customization group not found." };
  const verifiedOutletIds = (validTargets ?? []).map((o) => o.id);
  if (verifiedOutletIds.length === 0) {
    return { ok: false, error: "No valid target outlets selected." };
  }

  for (const targetOutletId of verifiedOutletIds) {
    const { data: existingTargetGroup } = await admin
      .from("customization_groups")
      .select("id")
      .eq("outlet_id", targetOutletId)
      .eq("name", sourceGroup.name)
      .maybeSingle();

    let targetGroupId = existingTargetGroup?.id ?? null;
    if (targetGroupId) {
      const { error: updErr } = await admin
        .from("customization_groups")
        .update({
          display_name: sourceGroup.display_name,
          selection_type: sourceGroup.selection_type,
          is_required: sourceGroup.is_required,
          min_selections: sourceGroup.min_selections,
          max_selections: sourceGroup.max_selections,
          free_selections: sourceGroup.free_selections,
          status: sourceGroup.status,
        })
        .eq("id", targetGroupId);
      if (updErr) return { ok: false, error: updErr.message };
    } else {
      const { data: maxRow } = await admin
        .from("customization_groups")
        .select("sort_order")
        .eq("outlet_id", targetOutletId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: created, error: insErr } = await admin
        .from("customization_groups")
        .insert({
          outlet_id: targetOutletId,
          name: sourceGroup.name,
          display_name: sourceGroup.display_name,
          selection_type: sourceGroup.selection_type,
          is_required: sourceGroup.is_required,
          min_selections: sourceGroup.min_selections,
          max_selections: sourceGroup.max_selections,
          free_selections: sourceGroup.free_selections,
          sort_order: (maxRow?.sort_order ?? 0) + 10,
          status: sourceGroup.status ?? "active",
        })
        .select("id")
        .single();
      if (insErr || !created) {
        return { ok: false, error: insErr?.message ?? "Failed to clone group." };
      }
      targetGroupId = created.id;
    }

    const { data: targetOpts } = await admin
      .from("customization_options")
      .select("id, name")
      .eq("group_id", targetGroupId);
    const byLowerName = new Map(
      (targetOpts ?? []).map((o) => [o.name.trim().toLowerCase(), o.id]),
    );
    const keptTargetOptIds = new Set<string>();
    const inserts: Array<{
      group_id: string;
      name: string;
      price: number;
      veg_status: string;
      is_default: boolean;
      max_qty: number;
      variant_prices: Json;
      sort_order: number;
      status: string;
    }> = [];

    for (const opt of sourceOptions ?? []) {
      const existingTargetOptId = byLowerName.get(opt.name.trim().toLowerCase());
      const rowData = {
        group_id: targetGroupId,
        name: opt.name,
        price: opt.price,
        veg_status: opt.veg_status ?? "Veg",
        is_default: Boolean(opt.is_default),
        max_qty: opt.max_qty ?? 1,
        variant_prices: (opt.variant_prices ?? {}) as Json,
        sort_order: opt.sort_order ?? 0,
        status: opt.status ?? "active",
      };
      if (existingTargetOptId) {
        keptTargetOptIds.add(existingTargetOptId);
        const { error: optUpdErr } = await admin
          .from("customization_options")
          .update(rowData)
          .eq("id", existingTargetOptId);
        if (optUpdErr) return { ok: false, error: optUpdErr.message };
      } else {
        inserts.push(rowData);
      }
    }

    const removeIds = (targetOpts ?? [])
      .map((o) => o.id)
      .filter((oid) => !keptTargetOptIds.has(oid));
    if (removeIds.length > 0) {
      await admin
        .from("customization_options")
        .delete()
        .in("id", removeIds)
        .eq("group_id", targetGroupId);
    }
    if (inserts.length > 0) {
      const { error: optInsErr } = await admin
        .from("customization_options")
        .insert(inserts);
      if (optInsErr) return { ok: false, error: optInsErr.message };
    }
  }

  revalidateMenuSurfaces(slug);
  return { ok: true };
}
