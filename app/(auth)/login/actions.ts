"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryRestaurant, getRoleInRestaurant } from "@/lib/auth";

type State = { error?: string } | null;

// Server action — returns an error message back to the form on failure,
// redirects on success. After auth we resolve where to land:
//   - if `next` was an explicit restaurant-scoped path (came from a
//     protected route's redirect), honour it
//   - otherwise pick a destination based on role:
//       admin / manager → /r/<slug>/admin/orders (ops overview)
//       user (cashier) / captain → /r/<slug>/pos (billing / table orders)
//       no role         → /dashboard           (signed-in customer)
export async function signInAction(_prev: State, formData: FormData): Promise<State> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase returns generic 'Invalid login credentials' — keep that
    // wording so we don't leak whether the email exists.
    return { error: error.message };
  }

  revalidatePath("/", "layout");

  // Honour safe internal destinations (e.g. the user was bounced from a
  // specific admin sub-page, POS route, or brand HQ page). Reject protocol-
  // relative (`//...`) or external URLs to prevent open redirects.
  const isSafeInternalNext =
    requestedNext.startsWith("/") &&
    !requestedNext.startsWith("//") &&
    (/^\/r\/[^/]+(\/|$)/.test(requestedNext) ||
      /^\/brands(\/|$)/.test(requestedNext) ||
      requestedNext === "/dashboard");
  if (isSafeInternalNext) {
    redirect(requestedNext);
  }

  const restaurant = await getPrimaryRestaurant();
  if (!restaurant) {
    // Signed-in customer with no role anywhere — show them their dashboard.
    redirect("/dashboard");
  }

  const role = await getRoleInRestaurant(restaurant.id);
  if (role === "admin" || role === "manager") {
    redirect(`/r/${restaurant.slug}/admin/orders`);
  }
  // Default for cashier (or any new role we don't recognise) → POS.
  redirect(`/r/${restaurant.slug}/pos`);
}
