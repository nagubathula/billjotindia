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
//       user (cashier)  → /r/<slug>/pos        (billing tool)
//       no role         → /dashboard           (signed-in customer)
export async function signInAction(_prev: State, formData: FormData): Promise<State> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase returns generic 'Invalid login credentials' — keep that
    // wording so we don't leak whether the email exists.
    return { error: error.message };
  }

  revalidatePath("/", "layout");

  // Honour explicit /r/.../ destinations (e.g. the user was bounced from a
  // specific protected page; we should send them back there).
  const looksRestaurantScoped = /^\/r\/[^/]+\//.test(requestedNext);
  if (looksRestaurantScoped) {
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
