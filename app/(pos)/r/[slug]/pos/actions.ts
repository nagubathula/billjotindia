"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { outletCookieName } from "@/lib/outlet-context";

/**
 * Set the cashier's selected outlet for this restaurant. Validates that the
 * outlet belongs to the restaurant AND that the user has staff access there.
 */
export async function setSelectedOutletAction(
  restaurantSlug: string,
  outletId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };

  await requireRole(["admin", "manager", "user"], {
    restaurantId: restaurant.id,
  });

  // Guard: outlet must belong to this restaurant. Without this an admin could
  // swap to an outlet of a different restaurant by tampering with the request.
  const supabase = createClient();
  const { data: outlet } = await supabase
    .from("outlets")
    .select("id")
    .eq("id", outletId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  if (!outlet) return { ok: false, error: "Outlet doesn't belong to this restaurant." };

  // Cookie is HttpOnly so client JS can't read it; server reads it on next
  // request. Path-restrict to this restaurant's tree.
  cookies().set(outletCookieName(restaurantSlug), String(outletId), {
    httpOnly: true,
    sameSite: "lax",
    path: `/r/${restaurantSlug}`,
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  revalidatePath(`/r/${restaurantSlug}/pos`);
  return { ok: true };
}
