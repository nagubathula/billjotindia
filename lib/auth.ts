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
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Restaurant } from "@/lib/types";

const ROLE_PRECEDENCE: Record<AppRole, number> = {
  admin: 3,
  manager: 2,
  user: 1,
};

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = createClient();
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
  async (): Promise<Array<{ restaurant_id: number; role: AppRole }>> => {
    const user = await getCurrentUser();
    if (!user) return [];

    const supabase = createClient();
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
  restaurantId: number,
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
export const getCurrentRestaurant = cache(
  async (opts?: { slug?: string; id?: number }): Promise<Restaurant | null> => {
    const supabase = createClient();
    let query = supabase.from("restaurants").select("*").limit(1);

    if (opts?.id) {
      query = query.eq("id", opts.id);
    } else if (opts?.slug) {
      query = query.eq("slug", opts.slug);
    } else {
      query = query.eq("slug", "default");
    }

    const { data } = await query.maybeSingle();
    return (data as Restaurant | null) ?? null;
  },
);

/**
 * Look up a restaurant by slug or id. Cached per-request.
 */
export const getRestaurantBySlug = cache(
  async (slug: string): Promise<Restaurant | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    return (data as Restaurant | null) ?? null;
  },
);

/**
 * All restaurants the current user holds any role in, with their effective
 * role per restaurant (admin > manager > user). Cached per-request.
 */
export const getUserRestaurants = cache(
  async (): Promise<Array<{ restaurant: Restaurant; role: AppRole }>> => {
    const roles = await getCurrentUserRoles();
    if (roles.length === 0) return [];

    // Collapse multiple role rows per restaurant to the highest precedence.
    const bestRole = new Map<number, AppRole>();
    for (const r of roles) {
      const cur = bestRole.get(r.restaurant_id);
      if (!cur || ROLE_PRECEDENCE[r.role] > ROLE_PRECEDENCE[cur]) {
        bestRole.set(r.restaurant_id, r.role);
      }
    }

    const supabase = createClient();
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
 * Return the default outlet for a restaurant — for now, just the lowest-id
 * outlet in that restaurant. Multi-outlet picking lands later.
 */
export const getDefaultOutletForRestaurant = cache(
  async (restaurantId: number): Promise<{ id: number } | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("outlets")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .order("id")
      .limit(1)
      .maybeSingle();
    return (data as { id: number } | null) ?? null;
  },
);

type RequireRoleOpts = {
  /** Force a specific restaurant by slug — Phase 3 layouts pass this from URL params. */
  restaurantSlug?: string;
  /** Force a specific restaurant by id — useful in admin actions. */
  restaurantId?: number;
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
  const next = opts.redirectTo ?? "/";

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const restaurant = await getCurrentRestaurant({
    id: opts.restaurantId,
    slug: opts.restaurantSlug,
  });
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
  const restaurant = await getCurrentRestaurant({
    id: opts.restaurantId,
    slug: opts.restaurantSlug,
  });
  if (!restaurant) return null;
  const role = await getRoleInRestaurant(restaurant.id);
  if (!role || !allowed.includes(role)) return null;
  return role;
}
