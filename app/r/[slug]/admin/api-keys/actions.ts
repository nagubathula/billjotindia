"use server";

import { revalidatePath } from "next/cache";
import { normalizeOriginInput } from "@/lib/api-cors";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { generateApiKey, isApiKeyScope, type ApiKeyScope } from "@/lib/api-keys";
import { generateWebhookSecret, normalizeWebhookUrl } from "@/lib/order-webhooks";
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

function parseOriginsList(
  raw: string[] | string | undefined,
): { ok: true; origins: string[] } | { ok: false; error: string } {
  const tokens = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[\n,]+/)
      : [];
  const out = new Set<string>();
  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const norm = normalizeOriginInput(trimmed);
    if (!norm) {
      return {
        ok: false,
        error: `"${trimmed}" isn't a valid website address (use e.g. https://order.yourcafe.com).`,
      };
    }
    out.add(norm);
    if (out.size > 20) {
      return {
        ok: false,
        error: "Add at most 20 allowed websites per API key.",
      };
    }
  }
  return { ok: true, origins: [...out] };
}

export async function createApiKeyAction(
  slug: string,
  input: {
    name: string;
    outletId: string | null;
    scopes: string[];
    allowedOrigins?: string[] | string;
    webhookUrl?: string;
  },
): Promise<Result<{ key: string; webhookSecret?: string | null }>> {
  const ctx = await adminContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the key a name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };

  const scopes = [...new Set(input.scopes)].filter(isApiKeyScope) as ApiKeyScope[];
  if (scopes.length === 0) {
    return { ok: false, error: "Choose at least one thing this key can do." };
  }

  const parsedOrigins = parseOriginsList(input.allowedOrigins);
  if (!parsedOrigins.ok) return parsedOrigins;

  const normWebhook = normalizeWebhookUrl(input.webhookUrl);
  if (normWebhook === null) {
    return {
      ok: false,
      error: "Enter a valid webhook URL (https:// in production).",
    };
  }
  const webhookUrl = normWebhook || null;
  const webhookSecret = webhookUrl ? generateWebhookSecret() : null;

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
    allowed_origins: parsedOrigins.origins,
    webhook_url: webhookUrl,
    webhook_secret: webhookSecret,
    created_by: ctx.user.id,
  });
  if (error) return { ok: false, error: "Couldn't create the key. Try again." };

  revalidatePath(`/r/${slug}/admin/api-keys`);
  return { ok: true, key, webhookSecret };
}

export async function updateApiKeyOriginsAction(
  slug: string,
  keyId: string,
  allowedOrigins: string[] | string,
  webhookUrlInput?: string,
  rotateWebhookSecret?: boolean,
): Promise<Result<{ webhookSecret?: string | null }>> {
  const ctx = await adminContext(slug);
  if (!ctx) return { ok: false, error: "Restaurant not found" };
  if (!isUuid(keyId)) return { ok: false, error: "Unknown key." };

  const parsedOrigins = parseOriginsList(allowedOrigins);
  if (!parsedOrigins.ok) return parsedOrigins;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("restaurant_api_keys")
    .select("id, webhook_url, webhook_secret")
    .eq("id", keyId)
    .eq("restaurant_id", ctx.restaurant.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "That key was revoked or doesn't exist." };
  }

  let nextWebhookUrl = existing.webhook_url;
  let nextWebhookSecret = existing.webhook_secret;
  let revealedSecret: string | null = null;

  if (webhookUrlInput !== undefined) {
    const normWebhook = normalizeWebhookUrl(webhookUrlInput);
    if (normWebhook === null) {
      return {
        ok: false,
        error: "Enter a valid webhook URL (https:// in production).",
      };
    }
    nextWebhookUrl = normWebhook || null;
    if (!nextWebhookUrl) {
      nextWebhookSecret = null;
    } else if (!existing.webhook_secret || rotateWebhookSecret) {
      nextWebhookSecret = generateWebhookSecret();
      revealedSecret = nextWebhookSecret;
    }
  }

  const { error } = await admin
    .from("restaurant_api_keys")
    .update({
      allowed_origins: parsedOrigins.origins,
      webhook_url: nextWebhookUrl,
      webhook_secret: nextWebhookSecret,
    })
    .eq("id", keyId)
    .eq("restaurant_id", ctx.restaurant.id)
    .is("revoked_at", null);
  if (error) {
    return { ok: false, error: "Couldn't update key settings. Try again." };
  }

  revalidatePath(`/r/${slug}/admin/api-keys`);
  return { ok: true, webhookSecret: revealedSecret };
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
