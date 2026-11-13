// CORS for the public API (/api/menu, /api/orders). Restaurant frontends live
// on their own domains, so browsers send a preflight and expect these headers.
//
// Allowed origins come from STOREFRONT_ALLOWED_ORIGINS (comma-separated). If it
// is unset, the caller's origin is reflected, which suits local development.

export const API_ALLOWED_HEADERS =
  "authorization, content-type, x-api-key, x-storefront-token";

export function resolveAllowedOrigin(origin: string | null): string | null {
  const raw = process.env.STOREFRONT_ALLOWED_ORIGINS?.trim();
  if (!raw || raw === "*") return origin ?? "*";
  const allow = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return origin && allow.includes(origin) ? origin : null;
}

export function apiCorsHeaders(
  origin: string | null,
  methods: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": API_ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const allowed = resolveAllowedOrigin(origin);
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}
