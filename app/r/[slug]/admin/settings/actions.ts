"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

export async function updateOutletAction(
  slug: string,
  outletId: number,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  const admin = createAdminClient();

  // Defence: outlet must belong to this restaurant.
  const { data: existing } = await admin
    .from("outlets")
    .select("id, restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!existing || existing.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet not in this restaurant." };
  }

  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim() || null,
    state_code: String(formData.get("state_code") ?? "").trim() || null,
    pincode: String(formData.get("pincode") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    gstin: String(formData.get("gstin") ?? "").trim() || null,
    fssai_license: String(formData.get("fssai_license") ?? "").trim() || null,
  };
  if (!payload.name) return { ok: false, error: "Outlet name is required." };

  const { error } = await admin.from("outlets").update(payload).eq("id", outletId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/settings`);
  revalidatePath(`/r/${slug}/pos`);
  return { ok: true };
}

// Normalize user input to a bare lowercase hostname, or null when blank.
// Accepts "https://Order.Cafe.com/", "order.cafe.com:443", etc.
function normalizeDomain(raw: string): string | null {
  let host = raw.trim().toLowerCase();
  if (!host) return null;
  host = host.replace(/^https?:\/\//, ""); // strip scheme
  host = host.split("/")[0]; // strip path
  host = host.split(":")[0]; // strip port
  host = host.replace(/\.$/, ""); // strip trailing dot
  return host || null;
}

const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export async function updateCustomDomainAction(
  slug: string,
  formData: FormData,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  // Custom domain is a sensitive routing setting — admins only.
  await requireRole(["admin"], { restaurantId: restaurant.id });

  const domain = normalizeDomain(String(formData.get("custom_domain") ?? ""));
  if (domain && !DOMAIN_RE.test(domain)) {
    return {
      ok: false,
      error: "Enter a valid domain like order.yourcafe.com (no http://).",
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("restaurants")
    .update({ custom_domain: domain })
    .eq("id", restaurant.id);

  if (error) {
    // 23505 = unique_violation: another restaurant already claimed it.
    if (error.code === "23505") {
      return { ok: false, error: "That domain is already in use by another restaurant." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/r/${slug}/admin/settings`);
  return { ok: true };
}
