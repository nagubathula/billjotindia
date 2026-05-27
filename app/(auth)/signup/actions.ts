"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type State =
  | { ok: true; emailSent: true; email: string; restaurantSlug: string }
  | { ok: true; emailSent: false; restaurantSlug: string }
  | { ok: false; error: string }
  | null;

// Slugify: lower-case ASCII, words joined by '-', no leading/trailing dashes.
// We append a short random suffix to avoid collisions ("Joe's Cafe" → "joes-cafe-a3b").
function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : `r-${suffix}`;
}

/**
 * Restaurant signup. Creates: an auth user, a restaurant tenant, and an
 * admin user_roles row linking the two. The new admin lands on the
 * restaurant's POS after confirming their email.
 *
 * Phase 5 of the multi-restaurant rollout — every signup is now a NEW
 * restaurant, not "join the default one". Staff additions happen via
 * /r/[slug]/admin/users by the restaurant's admin.
 *
 * If email confirmation is ON in Supabase, the user gets a confirmation
 * email pointing at /callback?next=/r/[slug]/pos. If OFF, they're signed
 * in immediately and the form redirects.
 */
export async function signUpAction(_prev: State, formData: FormData): Promise<State> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const restaurantName = String(formData.get("restaurant_name") ?? "").trim();

  if (!displayName) return { ok: false, error: "Enter your name." };
  if (!restaurantName) return { ok: false, error: "Enter your restaurant's name." };
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const admin = createAdminClient();

  // Create the restaurant first. If this fails, no auth user is created — clean.
  const slug = slugify(restaurantName);
  const { data: restaurant, error: restErr } = await admin
    .from("restaurants")
    .insert({ slug, name: restaurantName, status: "active" })
    .select()
    .single();
  if (restErr || !restaurant) {
    return {
      ok: false,
      error: `Couldn't create restaurant: ${restErr?.message ?? "unknown"}`,
    };
  }

  // Auto-seed a default outlet so the POS works immediately. Admin can rename
  // it / add details later from settings (when that UI lands). Multi-outlet
  // restaurants add more outlets through the same screen.
  const { error: outletErr } = await admin.from("outlets").insert({
    restaurant_id: restaurant.id,
    slug: "main",
    name: `${restaurantName} — Main`,
    status: "active",
  });
  if (outletErr) {
    // Roll back: orphaned restaurant otherwise.
    await admin.from("restaurants").delete().eq("id", restaurant.id);
    return {
      ok: false,
      error: `Couldn't create default outlet: ${outletErr.message}`,
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const next = `/r/${slug}/pos`;

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/callback?next=${encodeURIComponent(next)}`,
      data: { display_name: displayName, full_name: displayName },
    },
  });
  if (error || !data.user) {
    // Roll back the restaurant — we don't want orphans.
    await admin.from("restaurants").delete().eq("id", restaurant.id);
    return { ok: false, error: error?.message ?? "Signup failed." };
  }

  // Assign owner + admin role.
  await admin.from("restaurants").update({ owner_user_id: data.user.id }).eq("id", restaurant.id);
  const { error: roleErr } = await admin.from("user_roles").insert({
    user_id: data.user.id,
    restaurant_id: restaurant.id,
    role: "admin",
  });
  if (roleErr) {
    // The auth user exists but has no role. Surface the error; admin can
    // recover via the create-user.mjs script.
    return {
      ok: false,
      error: `Account created but role assign failed: ${roleErr.message}`,
    };
  }

  if (data.session) {
    // Email confirmation OFF — signed in immediately.
    return { ok: true, emailSent: false, restaurantSlug: slug };
  }
  return { ok: true, emailSent: true, email, restaurantSlug: slug };
}
