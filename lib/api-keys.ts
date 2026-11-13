// Restaurant API keys: how a restaurant's own websites and apps call
// /api/menu and /api/orders. Server-only — it uses the service-role client.
//
// A key looks like "bjk_" + 32 URL-safe random characters. Only its SHA-256
// hash is stored, so a database leak doesn't hand out working keys, and a key
// can only be shown in full once, right after it is created.

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const API_KEY_SCOPES = ["menu:read", "orders:write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  "menu:read": "Read menu",
  "orders:write": "Place orders",
};

const KEY_PREFIX = "bjk_";
// Enough of the key to tell keys apart in a list, too little to guess the rest.
const DISPLAY_PREFIX_LENGTH = KEY_PREFIX.length + 8;
// Writing last_used_at on every call would turn each read into a write.
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, DISPLAY_PREFIX_LENGTH) };
}

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return (API_KEY_SCOPES as readonly string[]).includes(value as string);
}

// The key a request carries: "Authorization: Bearer bjk_…" or "x-api-key".
export function presentedApiKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const match = auth.match(/^Bearer\s+(\S+)$/i);
    if (match && match[1].startsWith(KEY_PREFIX)) return match[1];
  }
  const header = request.headers.get("x-api-key")?.trim();
  return header || null;
}

export type ApiKeyContext = {
  id: string;
  restaurantId: string;
  // null: every outlet of the restaurant.
  outletId: string | null;
  scopes: ApiKeyScope[];
};

export type ApiKeyCheck =
  | { ok: true; key: ApiKeyContext }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Looks up the key a request carries and checks it may do `scope`.
 * Returns 401 for a missing, unknown or revoked key, and 403 when the key is
 * valid but wasn't given that permission.
 */
export async function authenticateApiKey(
  request: Request,
  scope: ApiKeyScope,
): Promise<ApiKeyCheck> {
  const presented = presentedApiKey(request);
  if (!presented) {
    return {
      ok: false,
      status: 401,
      error: "Missing API key. Send it as 'Authorization: Bearer <key>'.",
    };
  }

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("restaurant_api_keys")
    .select("id, restaurant_id, outlet_id, scopes, revoked_at, last_used_at")
    .eq("key_hash", hashApiKey(presented))
    .maybeSingle();

  if (!row || row.revoked_at) {
    return { ok: false, status: 401, error: "Invalid or revoked API key" };
  }

  const scopes = (row.scopes ?? []).filter(isApiKeyScope);
  if (!scopes.includes(scope)) {
    return {
      ok: false,
      status: 403,
      error: `This API key can't ${scope === "menu:read" ? "read the menu" : "place orders"}.`,
    };
  }

  const lastUsed = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
  if (Date.now() - lastUsed > LAST_USED_RESOLUTION_MS) {
    // Bookkeeping only; a failed write must not fail the caller's request.
    await supabase
      .from("restaurant_api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id)
      .then(
        () => undefined,
        () => undefined,
      );
  }

  return {
    ok: true,
    key: {
      id: row.id,
      restaurantId: row.restaurant_id,
      outletId: row.outlet_id,
      scopes,
    },
  };
}

/** Whether a key may act on this outlet (which must belong to `restaurantId`). */
export function keyCoversOutlet(
  key: ApiKeyContext,
  outlet: { id: string; restaurant_id: string },
) {
  if (outlet.restaurant_id !== key.restaurantId) return false;
  return key.outletId === null || key.outletId === outlet.id;
}
