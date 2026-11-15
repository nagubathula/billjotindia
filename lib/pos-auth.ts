import "server-only";
import { getRoleInRestaurant } from "@/lib/auth";
import { canTakePayment } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";

export type PosBillingCheck =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 403; error: string };

/**
 * A "pos" order carries a cashier's discount and rounding, so it may only come
 * from a signed-in staff member of the outlet's restaurant whose role can take
 * payments (admin, manager, cashier). Captains and anonymous callers are
 * refused. Used by the order API and the POS online-payment routes.
 */
export async function checkPosBillingAccess(outletId: unknown): Promise<PosBillingCheck> {
  if (!isUuid(outletId)) {
    return { ok: false, status: 400, error: "Unknown or inactive outlet" };
  }
  const { data: outlet } = await createAdminClient()
    .from("outlets")
    .select("restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet) return { ok: false, status: 400, error: "Unknown or inactive outlet" };

  const role = await getRoleInRestaurant(outlet.restaurant_id);
  if (!role) {
    return { ok: false, status: 401, error: "Sign in to the POS to take payments." };
  }
  if (!canTakePayment(role)) {
    return {
      ok: false,
      status: 403,
      error: "Captains can't take payments. Ask a cashier to settle this bill.",
    };
  }
  return { ok: true };
}
