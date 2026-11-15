// CORS for the public API (/api/menu, /api/orders). Restaurant frontends live
// on their own domains, so browsers send a preflight and expect these headers.
//
// Per-key `allowed_origins` on `restaurant_api_keys` is the primary control:
//   • Server-to-server calls carry no `Origin` header and are always allowed.
//   • Browser calls carry `Origin`, which must match one of the key's
//     `allowed_origins` (or global `STOREFRONT_ALLOWED_ORIGINS` / localhost in
//     local development when the key hasn't locked down specific domains).
//   • On `OPTIONS` preflight (where browsers don't send Authorization yet),
//     any origin configured on an active API key or `STOREFRONT_ALLOWED_ORIGINS`
//     is permitted to proceed to the authenticated request.

import { createAdminClient } from "@/lib/supabase/admin";

export const API_ALLOWED_HEADERS =
  "authorization, content-type, x-api-key, x-customer-token";

/** Strict HTTP Origin header parser (`http://` or `https://`, no path/query). */
export function normalizeOriginHeader(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      // Browsers send exact `<scheme>://<host>[:<port>]`, whose parsed pathname is "/"
      if (trimmed.replace(/\/$/, "").toLowerCase() !== url.origin.toLowerCase()) {
        return null;
      }
    }
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Normalizes user-entered website origins from Admin → API keys.
 * Accepts `https://order.mycafe.com`, `order.mycafe.com`, or `localhost:3001`.
 */
export function normalizeOriginInput(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;
  text = text.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(text)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(text);
    text = `${isLocal ? "http" : "https"}://${text}`;
  }
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
      return null;
    }
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalDevOrigin(origin: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function globalAllowedOrigins(): string[] | "*" | null {
  const raw = process.env.STOREFRONT_ALLOWED_ORIGINS?.trim();
  if (!raw) return null;
  if (raw === "*") return "*";
  return raw
    .split(",")
    .map((s) => normalizeOriginInput(s))
    .filter((s): s is string => Boolean(s));
}

export function resolveAllowedOrigin(
  origin: string | null,
  keyAllowedOrigins?: readonly string[] | null,
  requestUrl?: string,
): string | null {
  const norm = normalizeOriginHeader(origin);
  if (!norm) return null;

  // Same-origin browser requests (e.g. Billjot's own storefront or POS)
  if (requestUrl) {
    try {
      if (new URL(requestUrl).origin.toLowerCase() === norm) return norm;
    } catch {
      // ignore invalid requestUrl
    }
  }

  // Per-key allowlist takes precedence when configured on the key
  if (keyAllowedOrigins && keyAllowedOrigins.length > 0) {
    const normalizedKeyOrigins = keyAllowedOrigins
      .map((o) => normalizeOriginInput(o))
      .filter((o): o is string => Boolean(o));
    return normalizedKeyOrigins.includes(norm) ? norm : null;
  }

  // Fallback to global STOREFRONT_ALLOWED_ORIGINS or local dev convenience
  const globalAllow = globalAllowedOrigins();
  if (globalAllow === "*") return norm;
  if (globalAllow && globalAllow.includes(norm)) return norm;
  if (!globalAllow && isLocalDevOrigin(norm)) return norm;

  return null;
}

/**
 * Checks whether a request carrying a specific API key is allowed from its
 * `Origin` header. Server-to-server calls (no `Origin`) are always allowed.
 */
export function isOriginAllowedForKey(
  origin: string | null,
  keyAllowedOrigins: readonly string[],
  requestUrl?: string,
): boolean {
  if (!origin) return true;
  return resolveAllowedOrigin(origin, keyAllowedOrigins, requestUrl) !== null;
}

export function apiCorsHeaders(
  origin: string | null,
  methods: string,
  keyAllowedOrigins?: readonly string[] | null,
  requestUrl?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": API_ALLOWED_HEADERS,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  const allowed = resolveAllowedOrigin(origin, keyAllowedOrigins, requestUrl);
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}

/**
 * Preflight OPTIONS handler helper: since browsers omit `Authorization` on
 * preflight, allow the preflight when `Origin` matches same-origin, global
 * `STOREFRONT_ALLOWED_ORIGINS`, local dev, or any active API key's
 * `allowed_origins`. The actual GET/POST still verifies the specific key!
 */
export async function preflightCorsHeaders(
  request: Request,
  methods: string,
): Promise<Record<string, string>> {
  const origin = request.headers.get("origin");
  const base = apiCorsHeaders(origin, methods, null, request.url);
  if (base["Access-Control-Allow-Origin"] || !origin) {
    return base;
  }

  const norm = normalizeOriginHeader(origin);
  if (!norm) return base;

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("restaurant_api_keys")
      .select("id")
      .is("revoked_at", null)
      .contains("allowed_origins", [norm])
      .limit(1);
    if (data && data.length > 0) {
      base["Access-Control-Allow-Origin"] = norm;
    }
  } catch {
    // Fail closed on DB error during preflight
  }
  return base;
}
