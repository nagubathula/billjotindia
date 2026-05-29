import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Apex domain for tenant subdomains, e.g. "billjot.app" (or "lvh.me" in dev).
// When UNSET, subdomain routing is disabled and the app stays path-based
// (`/r/<slug>`), so local dev and preview deploys need no extra setup.
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

// Returns the store slug encoded in the request's subdomain, or null when the
// request isn't a tenant subdomain (apex, reserved, custom domain, or no
// ROOT_DOMAIN configured).
function tenantSlug(request: NextRequest): string | null {
  if (!ROOT_DOMAIN) return null;
  const hostname = (request.headers.get("host") ?? "").split(":")[0];
  if (hostname === ROOT_DOMAIN || !hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    return null;
  }
  const sub = hostname.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!sub || RESERVED_SUBDOMAINS.has(sub)) return null;
  return sub;
}

export async function middleware(request: NextRequest) {
  const slug = tenantSlug(request);

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
