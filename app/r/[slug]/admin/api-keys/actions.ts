"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { generateApiKey, isApiKeyScope, type ApiKeyScope } from "@/lib/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function adminContext(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  const { user } = await requireRole(["admin"], {
    restaurantId: restaurant.id,
    redirectTo: `/r/${slug}/admin/api-keys`,
  });
  return { restaurant, user };
}

export async function createApiKeyAction(
  slug: string,
  input: { name: string; outletId: string | null; scopes: string[] },
): Promise<Result<{ key: string }>> {
  const ctx = await adminContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the key a name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };

  const scopes = [...new Set(input.scopes)].filter(isApiKeyScope) as ApiKeyScope[];
  if (scopes.length === 0) {
    return { ok: false, error: "Choose at least one thing this key can do." };
  }

  const admin = createAdminClient();
  let outletId: string | null = null;
  if (input.outletId) {
    if (!isUuid(input.outletId)) return { ok: false, error: "Unknown outlet." };
    const { data: outlet } = await admin
      .from("outlets")
      .select("id, restaurant_id")
      .eq("id", input.outletId)
      .maybeSingle();
    if (!outlet || outlet.restaurant_id !== ctx.restaurant.id) {
      return { ok: false, error: "Unknown outlet." };
    }
    outletId = outlet.id;
  }

  const { key, hash, prefix } = generateApiKey();
  const { error } = await admin.from("restaurant_api_keys").insert({
    restaurant_id: ctx.restaurant.id,
    outlet_id: outletId,
    name,
    key_prefix: prefix,
    key_hash: hash,
    scopes,
    created_by: ctx.user.id,
  });
  if (error) return { ok: false, error: "Couldn't create the key. Try again." };

  revalidatePath(`/r/${slug}/admin/api-keys`);
  return { ok: true, key };
}

export async function revokeApiKeyAction(
  slug: string,
  keyId: string,
): Promise<Result> {
  const ctx = await adminContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found" };
  if (!isUuid(keyId)) return { ok: false, error: "Unknown key." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("restaurant_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("restaurant_id", ctx.restaurant.id)
    .is("revoked_at", null)
    .select("id");
  if (error) return { ok: false, error: "Couldn't revoke the key. Try again." };
  if (!data || data.length === 0) {
    return { ok: false, error: "That key was already revoked or doesn't exist." };
  }

  revalidatePath(`/r/${slug}/admin/api-keys`);
  return { ok: true };
}
