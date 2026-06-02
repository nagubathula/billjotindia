import { type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { updateSession } from "@/lib/supabase/middleware";
import type { Database } from "@/lib/database.types";

// Apex domain for tenant subdomains, e.g. "billjot.app" (or "lvh.me" in dev).
// When UNSET, subdomain routing is disabled and the app stays path-based
// (`/r/<slug>`), so local dev and preview deploys need no extra setup.
// Custom domains (below) work regardless of this setting.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

// Subdomains reserved for the app itself — never treated as a store slug.
const RESERVED_SUBDOMAINS = new Set(["www", "app", "auth", "api"]);

// Paths that live at the app root and must not be tenant-rewritten.
const RESERVED_PATHS = [
  "/r/",
  "/api/",
  "/callback",
  "/login",
  "/logout",
  "/signup",
  "/dashboard",
];

// Custom-domain → slug lookups hit the DB, so cache them (including negative
// results, slug === null) for a short window to avoid a query per request.
// A module-level Map is per-runtime-instance, which is the right granularity:
// hot instances stay fast, cold ones just re-warm.
const CUSTOM_DOMAIN_TTL_MS = 60_000;
const customDomainCache = new Map<
  string,
  { slug: string | null; expires: number }
>();

// Slug encoded in a `<slug>.<ROOT_DOMAIN>` subdomain, or null. Pure string
// work — no DB — so it's free to run on every request.
function subdomainSlug(hostname: string): string | null {
  if (!ROOT_DOMAIN) return null;
  if (hostname === ROOT_DOMAIN || !hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return null;
  }
  const sub = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!sub || RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

// True when `hostname` could plausibly be a tenant's own domain — i.e. worth a
// DB lookup. Excludes localhost, raw IPs, and anything under ROOT_DOMAIN
// (those are handled by subdomainSlug, never as custom domains).
function couldBeCustomDomain(hostname: string): boolean {
  if (!hostname.includes(".")) return false; // bare "localhost", service names
  if (hostname.endsWith(".localhost")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false; // IPv4
  if (
    ROOT_DOMAIN &&
    (hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`))
  ) {
    return false;
  }
  return true;
}

// Resolve a tenant's custom domain (e.g. order.cafemocha.com) to its store
// slug via a narrow SECURITY DEFINER RPC. Returns null for unknown domains.
async function customDomainSlug(hostname: string): Promise<string | null> {
  const now = Date.now();
  const cached = customDomainCache.get(hostname);
  if (cached && cached.expires > now) return cached.slug;

  let slug: string | null = null;
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data } = await supabase.rpc("restaurant_slug_for_domain", {
      host: hostname,
    });
    slug = (data as string | null) ?? null;
  } catch {
    // Network/DB hiccup: treat as "not a tenant domain" and serve the apex app.
    slug = null;
  }

  customDomainCache.set(hostname, {
    slug,
    expires: now + CUSTOM_DOMAIN_TTL_MS,
  });
  return slug;
}

// The store slug for this request, from either a platform subdomain or a
// tenant's custom domain. Null for the apex app, reserved hosts, and local dev.
async function tenantSlug(request: NextRequest): Promise<string | null> {
  const hostname = (request.headers.get("host") ?? "")
    .split(":")[0]
    .toLowerCase();
  if (!hostname) return null;

  const sub = subdomainSlug(hostname);
  if (sub) return sub;

  if (couldBeCustomDomain(hostname)) return customDomainSlug(hostname);
  return null;
}

export async function middleware(request: NextRequest) {
  const slug = await tenantSlug(request);

  let rewriteUrl: URL | undefined;
  if (slug) {
    const path = request.nextUrl.pathname;
    const bypass = RESERVED_PATHS.some((p) => path.startsWith(p));
    if (!bypass) {
      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/r/${slug}${path}`;
    }
  }

  return updateSession(request, rewriteUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
