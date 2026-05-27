// Server-side outlet selection helpers. The currently-selected outlet for a
// restaurant is stored in a cookie per restaurant — `billjot.outlet.<slug>`.
// The POS terminal is conceptually tied to one outlet at a time, so cookie
// per terminal is the right grain.

import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getDefaultOutletForRestaurant } from "@/lib/auth";
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
  async (restaurantId: number, restaurantSlug: string): Promise<Outlet | null> => {
    const cookieStore = cookies();
    const cookieVal = cookieStore.get(cookieName(restaurantSlug))?.value;

    const supabase = createClient();

    if (cookieVal) {
      const cookieOutletId = Number(cookieVal);
      if (Number.isFinite(cookieOutletId)) {
        const { data } = await supabase
          .from("outlets")
          .select("*")
          .eq("id", cookieOutletId)
          .eq("restaurant_id", restaurantId) // guard: cookie can't escape restaurant scope
          .maybeSingle();
        if (data) return data as Outlet;
      }
    }

    // Fall back to default. We hit the same restaurant_id-scoped index.
    const def = await getDefaultOutletForRestaurant(restaurantId);
    if (!def) return null;
    const { data } = await supabase
      .from("outlets")
      .select("*")
      .eq("id", def.id)
      .maybeSingle();
    return (data as Outlet | null) ?? null;
  },
);

/**
 * All outlets belonging to a restaurant. Used by the outlet picker dropdown.
 */
export const getOutletsForRestaurant = cache(
  async (restaurantId: number): Promise<Outlet[]> => {
    const supabase = createClient();
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
