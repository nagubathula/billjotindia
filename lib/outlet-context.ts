// Server-side outlet selection helpers. The currently-selected outlet for a
// restaurant is stored in a cookie per restaurant — `billjot.outlet.<slug>`.
// The POS terminal is conceptually tied to one outlet at a time, so cookie
// per terminal is the right grain.

import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Outlet } from "@/lib/types";

function cookieName(slug: string) {
  return `billjot.outlet.${slug}`;
}

/**
 * Resolve the currently-selected outlet for a restaurant. Reads the cookie
 * first, falls back to the restaurant's default outlet (lowest-id). Returns
 * null if the restaurant has no outlets at all.
 */
export const getSelectedOutlet = cache(
  async (restaurantId: string, restaurantSlug: string): Promise<Outlet | null> => {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get(cookieName(restaurantSlug))?.value;

    const supabase = await createClient();

    if (cookieVal) {
      const cookieOutletId = cookieVal;
      if (cookieOutletId) {
        const { data } = await supabase
          .from("outlets")
          .select("*")
          .eq("id", cookieOutletId)
          .eq("restaurant_id", restaurantId) // guard: cookie can't escape restaurant scope
          .maybeSingle();
        if (data) return data as Outlet;
      }
    }

    // Fall back to the default (lowest-id) outlet. Re-uses the request-cached
    // outlet list (ordered by id) instead of two extra round trips.
    const all = await getOutletsForRestaurant(restaurantId);
    return all[0] ?? null;
  },
);

/**
 * All outlets belonging to a restaurant. Used by the outlet picker dropdown.
 */
export const getOutletsForRestaurant = cache(
  async (restaurantId: string): Promise<Outlet[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("outlets")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("id");
    return (data ?? []) as Outlet[];
  },
);

/**
 * Cookie name exposed so server actions can write it.
 */
export function outletCookieName(restaurantSlug: string) {
  return cookieName(restaurantSlug);
}
