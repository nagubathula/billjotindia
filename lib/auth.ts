// Server-side auth + RBAC helpers, restaurant-scoped.
//
// Phase 2 of the multi-restaurant rollout:
//   - getCurrentUserRoles() returns ALL roles across ALL restaurants for the
//     signed-in user (Array<{ restaurant_id, role }>).
//   - getRoleInRestaurant(restaurantId) collapses that to the highest-
//     precedence role within one restaurant.
//   - getCurrentRestaurant() resolves "which restaurant is this request
//     about?" — for now it returns the default restaurant; Phase 3 will
//     resolve from `/r/[slug]/...` URL segments.
//   - requireRole(allowed, opts) gates per-restaurant. opts.restaurantSlug
//     or opts.restaurantId override the URL/default resolution.
//
// Every helper is React-cached, so a single render only hits Supabase once.

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_PRECEDENCE } from "@/lib/roles";
import type { AppRole, Brand, Restaurant } from "@/lib/types";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

// Kept as a thin alias for code that wanted "the session-bearing user".
export const getSession = getCurrentUser;

/**
 * Returns all (restaurant_id, role) pairs for the signed-in user, or [] if
 * not signed in or no roles assigned anywhere.
 */
export const getCurrentUserRoles = cache(
  async (): Promise<Array<{ restaurant_id: string; role: AppRole }>> => {
    const user = await getCurrentUser();
    if (!user) return [];

    const supabase = await createClient();
    const { data } = await supabase
      .from("user_roles")
      .select("restaurant_id, role")
      .eq("user_id", user.id);

    return (data ?? []).map((r) => ({
      restaurant_id: r.restaurant_id,
      role: r.role as AppRole,
    }));
  },
);

/**
 * Highest-precedence role the current user holds in the given restaurant,
 * or null if they hold none.
 */
export async function getRoleInRestaurant(
  restaurantId: string,
): Promise<AppRole | null> {
  const roles = await getCurrentUserRoles();
  const scoped = roles.filter((r) => r.restaurant_id === restaurantId);
  if (scoped.length === 0) return null;
  return scoped.reduce<AppRole>(
    (best, r) =>
      ROLE_PRECEDENCE[r.role] > ROLE_PRECEDENCE[best] ? r.role : best,
    scoped[0].role,
  );
}

/**
 * Resolves the "current restaurant" for this request.
 *
 * Phase 2: falls back to the default restaurant. Phase 3 will resolve from
 * the `/r/[slug]/...` URL segment by passing the slug explicitly via the
 * `slug` option (so this function never has to read request context itself).
 */
// Not wrapped in cache() itself: React's cache keys on argument identity, so
// an options object would miss every time. It delegates to the primitive-keyed
// cached lookups instead, which also share results with layouts/pages that
// already called getRestaurantBySlug for the same slug.
export async function getCurrentRestaurant(opts?: {
  slug?: string;
  id?: string;
}): Promise<Restaurant | null> {
  if (opts?.id) return getRestaurantById(opts.id);
  return getRestaurantBySlug(opts?.slug ?? "default");
}

export const getRestaurantById = cache(
  async (id: string): Promise<Restaurant | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return (data as Restaurant | null) ?? null;
  },
);

/**
 * Look up a restaurant by slug. Cached per-request.
 */
export const getRestaurantBySlug = cache(
  async (slug: string): Promise<Restaurant | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    return (data as Restaurant | null) ?? null;
  },
);

/**
 * Public storefront identity for a restaurant — the safe subset a logged-out
 * customer is allowed to see. Resolved via a SECURITY DEFINER RPC so it works
 * without a session and without exposing the members-only restaurants table.
 */
export type PublicRestaurant = { id: string; slug: string; name: string };

export const getPublicRestaurant = cache(
  async (slug: string): Promise<PublicRestaurant | null> => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("public_restaurant_by_slug", {
      p_slug: slug,
    });
    const row = (data as PublicRestaurant[] | null)?.[0];
    return row ?? null;
  },
);

/**
 * Customer-facing outlet details (no tax/ops fields) for a restaurant, ordered
 * by id. The first entry is the default outlet. Anon-safe via SECURITY DEFINER.
 */
export type PublicOutlet = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
};

export const getPublicOutlets = cache(
  async (restaurantId: string): Promise<PublicOutlet[]> => {
    const supabase = await createClient();
    const { data } = await supabase.rpc("public_outlets_for_restaurant", {
      p_restaurant_id: restaurantId,
    });
    return (data as PublicOutlet[] | null) ?? [];
  },
);

/**
 * All restaurants the current user holds any role in, with their effective
 * role per restaurant (admin > manager > cashier > captain). Cached per-request.
 */
export const getUserRestaurants = cache(
  async (): Promise<Array<{ restaurant: Restaurant; role: AppRole }>> => {
    const roles = await getCurrentUserRoles();
    if (roles.length === 0) return [];

    // Collapse multiple role rows per restaurant to the highest precedence.
    const bestRole = new Map<string, AppRole>();
    for (const r of roles) {
      const cur = bestRole.get(r.restaurant_id);
      if (!cur || ROLE_PRECEDENCE[r.role] > ROLE_PRECEDENCE[cur]) {
        bestRole.set(r.restaurant_id, r.role);
      }
    }

    const supabase = await createClient();
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .in("id", Array.from(bestRole.keys()))
      .order("name");
    const rows = (data ?? []) as Restaurant[];
    return rows.map((r) => ({ restaurant: r, role: bestRole.get(r.id)! }));
  },
);

/**
 * Backwards-compatible: the user's primary (first) restaurant. Prefer
 * getUserRestaurants() to render multi-restaurant UI; this is the fallback
 * for things that need exactly one (legacy callers, default linking).
 */
export const getPrimaryRestaurant = cache(
  async (): Promise<Restaurant | null> => {
    const list = await getUserRestaurants();
    return list[0]?.restaurant ?? null;
  },
);

/**
 * Brands visible to the current signed-in user: brands they own directly OR
 * brands attached to any restaurant where they hold the `admin` role.
 */
export const getUserBrands = cache(
  async (): Promise<
    Array<{ brand: Brand; isOwner: boolean; restaurantCount: number }>
  > => {
    const [user, ownRestaurants] = await Promise.all([
      getCurrentUser(),
      getUserRestaurants(),
    ]);
    if (!user) return [];

    const adminBrandIds = [
      ...new Set(
        ownRestaurants
          .filter((r) => r.role === "admin" && r.restaurant.brand_id)
          .map((r) => r.restaurant.brand_id as string),
      ),
    ];

    const admin = createAdminClient();
    const [ownedRes, attachedRes] = await Promise.all([
      admin.from("brands").select("*").eq("owner_user_id", user.id),
      adminBrandIds.length > 0
        ? admin.from("brands").select("*").in("id", adminBrandIds)
        : Promise.resolve({ data: [] as Brand[] }),
    ]);

    const byId = new Map<string, Brand>();
    for (const b of (ownedRes.data ?? []) as Brand[]) byId.set(b.id, b);
    for (const b of (attachedRes.data ?? []) as Brand[]) byId.set(b.id, b);

    const brands = [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    if (brands.length === 0) return [];

    const { data: brandRestRows } = await admin
      .from("restaurants")
      .select("id, brand_id")
      .in(
        "brand_id",
        brands.map((b) => b.id),
      );

    const countByBrand = new Map<string, number>();
    for (const row of brandRestRows ?? []) {
      if (!row.brand_id) continue;
      countByBrand.set(
        row.brand_id,
        (countByBrand.get(row.brand_id) ?? 0) + 1,
      );
    }

    return brands.map((brand) => ({
      brand,
      isOwner: brand.owner_user_id === user.id,
      restaurantCount: countByBrand.get(brand.id) ?? 0,
    }));
  },
);

/**
 * Return the default outlet for a restaurant — for now, just the lowest-id
 * outlet in that restaurant. Multi-outlet picking lands later.
 */
export const getDefaultOutletForRestaurant = cache(
  async (restaurantId: string): Promise<{ id: string } | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("outlets")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .order("id")
      .limit(1)
      .maybeSingle();
    return (data as { id: string } | null) ?? null;
  },
);

type RequireRoleOpts = {
  /** Force a specific restaurant by slug — Phase 3 layouts pass this from URL params. */
  restaurantSlug?: string;
  /** Force a specific restaurant by id — useful in admin actions. */
  restaurantId?: string;
  /** Where to send the user after sign-in on success (default '/'). */
  redirectTo?: string;
};

/**
 * Redirects to /login (preserving destination) if the current user isn't
 * signed in, doesn't have a role in the resolved restaurant, or that role
 * isn't in the allowed list. Returns the {user, role, restaurant} on
 * success so the caller doesn't re-query.
 */
export async function requireRole(allowed: AppRole[], opts: RequireRoleOpts = {}) {
  let next = opts.redirectTo;
  if (!next) {
    try {
      const reqHeaders = await headers();
      next = reqHeaders.get("x-current-path") ?? "/";
    } catch {
      next = "/";
    }
  }

  // Independent lookups run concurrently: the auth check + role rows (which
  // chain internally) alongside the restaurant row. All are request-cached,
  // so the getRoleInRestaurant call below re-uses the roles already fetched.
  const [user, restaurant] = await Promise.all([
    getCurrentUser(),
    getCurrentRestaurant({ id: opts.restaurantId, slug: opts.restaurantSlug }),
    getCurrentUserRoles(),
  ]);
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  if (!restaurant) {
    // Shouldn't happen once Phase 5 ensures every signup creates a restaurant,
    // but bail safely if the requested one doesn't exist.
    redirect(`/login?next=${encodeURIComponent(next)}&error=no_restaurant`);
  }

  const role = await getRoleInRestaurant(restaurant.id);
  if (!role || !allowed.includes(role)) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=forbidden`);
  }

  return { user, role, restaurant };
}

/**
 * Non-redirecting variant of requireRole — returns the role or null. Useful
 * in server components that conditionally render based on access.
 */
export async function maybeRole(
  allowed: AppRole[],
  opts: RequireRoleOpts = {},
): Promise<AppRole | null> {
  const [restaurant] = await Promise.all([
    getCurrentRestaurant({ id: opts.restaurantId, slug: opts.restaurantSlug }),
    getCurrentUserRoles(),
  ]);
  if (!restaurant) return null;
  const role = await getRoleInRestaurant(restaurant.id);
  if (!role || !allowed.includes(role)) return null;
  return role;
}
