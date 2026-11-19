// Restaurant API keys: how a restaurant's own websites and apps call
// /api/menu, /api/orders, and /api/bookings. Server-only — uses service role.
//
// A key looks like "bjk_" + 32 URL-safe random characters. Only its SHA-256
// hash is stored, so a database leak doesn't hand out working keys, and a key
// can only be shown in full once, right after it is created.

import { createHash, randomBytes } from "node:crypto";
import { isOriginAllowedForKey } from "@/lib/api-cors";
import { createAdminClient } from "@/lib/supabase/admin";

export const API_KEY_SCOPES = [
  "menu:read",
  "orders:write",
  "bookings:read",
  "bookings:write",
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const SCOPE_LABEL: Record<ApiKeyScope, string> = {
  "menu:read": "Read menu",
  "orders:write": "Place orders",
  "bookings:read": "Read bookings",
  "bookings:write": "Manage bookings",
};

const SCOPE_DENIAL_ACTION: Record<ApiKeyScope, string> = {
  "menu:read": "read the menu",
  "orders:write": "place orders",
  "bookings:read": "read table bookings",
  "bookings:write": "create or manage table bookings",
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
  allowedOrigins: string[];
};

export type ApiKeyCheck =
  | { ok: true; key: ApiKeyContext }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Looks up the key a request carries, ensures at least one scope in `anyOfScopes`
 * is granted, and verifies the browser `Origin` (if any) is permitted for this key.
 */
export async function authenticateApiKeyAnyScope(
  request: Request,
  anyOfScopes: ApiKeyScope[],
  supabaseClient?: ReturnType<typeof createAdminClient>,
): Promise<ApiKeyCheck> {
  const presented = presentedApiKey(request);
  if (!presented) {
    return {
      ok: false,
      status: 401,
      error: "Missing API key. Send it as 'Authorization: Bearer <key>'.",
    };
  }

  const supabase = supabaseClient ?? createAdminClient();
  const { data: row } = await supabase
    .from("restaurant_api_keys")
    .select(
      "id, restaurant_id, outlet_id, scopes, allowed_origins, revoked_at, last_used_at",
    )
    .eq("key_hash", hashApiKey(presented))
    .maybeSingle();

  if (!row || row.revoked_at) {
    return { ok: false, status: 401, error: "Invalid or revoked API key" };
  }

  const scopes = (row.scopes ?? []).filter(isApiKeyScope);
  if (!anyOfScopes.some((s) => scopes.includes(s))) {
    const primary = anyOfScopes[0] ?? "menu:read";
    return {
      ok: false,
      status: 403,
      error: `This API key can't ${SCOPE_DENIAL_ACTION[primary]}.`,
    };
  }

  const allowedOrigins = Array.isArray(row.allowed_origins)
    ? row.allowed_origins
    : [];
  const origin = request.headers.get("origin");
  if (!isOriginAllowedForKey(origin, allowedOrigins, request.url)) {
    return {
      ok: false,
      status: 403,
      error: "This API key isn't allowed from this website origin.",
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
      allowedOrigins,
    },
  };
}

/**
 * Looks up the key a request carries, checks `scope`, and verifies the caller's
 * browser `Origin` (if any) is permitted for this key.
 */
export async function authenticateApiKey(
  request: Request,
  scope: ApiKeyScope,
  supabaseClient?: ReturnType<typeof createAdminClient>,
): Promise<ApiKeyCheck> {
  return authenticateApiKeyAnyScope(request, [scope], supabaseClient);
}

/** Whether a key may act on this outlet (which must belong to `restaurantId`). */
export function keyCoversOutlet(
  key: ApiKeyContext,
  outlet: { id: string; restaurant_id: string },
) {
  if (outlet.restaurant_id !== key.restaurantId) return false;
  return key.outletId === null || key.outletId === outlet.id;
}
