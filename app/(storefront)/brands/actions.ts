"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : `b-${suffix}`;
}

type State = { ok: true; slug: string } | { ok: false; error: string } | null;

/**
 * Create a brand owned by the current user. The user becomes the brand's
 * owner_user_id; they can attach existing restaurants to it from the brand
 * detail page.
 */
export async function createBrandAction(_prev: State, formData: FormData): Promise<State> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Enter a brand name." };

  const admin = createAdminClient();
  const slug = slugify(name);
  const { data, error } = await admin
    .from("brands")
    .insert({ slug, name, owner_user_id: user.id, status: "active" })
    .select()
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Couldn't create brand." };
  }

  revalidatePath("/dashboard");
  return { ok: true, slug };
}

/**
 * Attach an existing restaurant the user already admins to a brand they own.
 * Doesn't grant any new access — it just sets the brand_id FK so the brand
 * dashboard can roll it up.
 */
export async function attachRestaurantToBrandAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const brandId = Number(formData.get("brand_id") ?? 0);
  const restaurantId = Number(formData.get("restaurant_id") ?? 0);
  if (!brandId || !restaurantId) {
    return { ok: false, error: "Missing brand or restaurant." };
  }

  const admin = createAdminClient();

  // Verify the user owns this brand.
  const { data: brand } = await admin
    .from("brands")
    .select("id, slug, owner_user_id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand || brand.owner_user_id !== user.id) {
    return { ok: false, error: "You don't own that brand." };
  }

  // Verify the user is an admin of the restaurant (only admins can move it
  // into a brand). We check via user_roles directly.
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) {
    return { ok: false, error: "You must be admin of that restaurant to attach it." };
  }

  const { error } = await admin
    .from("restaurants")
    .update({ brand_id: brandId })
    .eq("id", restaurantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/brands/${brand.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Remove a restaurant from a brand (sets brand_id to null). Restaurant data
 * is unaffected.
 */
export async function detachRestaurantFromBrandAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const brandId = Number(formData.get("brand_id") ?? 0);
  const restaurantId = Number(formData.get("restaurant_id") ?? 0);
  if (!brandId || !restaurantId) {
    return { ok: false, error: "Missing brand or restaurant." };
  }

  const admin = createAdminClient();
  const { data: brand } = await admin
    .from("brands")
    .select("id, slug, owner_user_id")
    .eq("id", brandId)
    .maybeSingle();
  if (!brand || brand.owner_user_id !== user.id) {
    return { ok: false, error: "You don't own that brand." };
  }

  const { error } = await admin
    .from("restaurants")
    .update({ brand_id: null })
    .eq("id", restaurantId)
    .eq("brand_id", brandId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/brands/${brand.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
