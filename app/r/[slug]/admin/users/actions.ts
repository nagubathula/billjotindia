"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppRole } from "@/lib/types";

const ALLOWED: AppRole[] = ["admin", "manager", "user"];

type ActionResult =
  | { ok: true; password?: string }
  | { ok: false; error: string };

function parseRestaurantId(formData: FormData): number | null {
  const raw = String(formData.get("restaurant_id") ?? "");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Create a new staff user with email + password directly for THIS restaurant.
 * If the email already exists in Supabase auth, returns an error pointing the
 * admin at "Reset password" (which works restaurant-scoped too).
 */
export async function createUserAction(formData: FormData): Promise<ActionResult> {
  const restaurantId = parseRestaurantId(formData);
  if (!restaurantId) return { ok: false, error: "Missing restaurant context." };

  await requireRole(["admin"], { restaurantId });

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as AppRole;
  const displayName = String(formData.get("display_name") ?? "").trim();
  let password = String(formData.get("password") ?? "");
  const generatedRequested = !password;

  if (!displayName) {
    return { ok: false, error: "Enter the staff member's name." };
  }
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email." };
  }
  if (!ALLOWED.includes(role)) {
    return { ok: false, error: "Pick a role." };
  }
  if (password && password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!password) {
    password = randomBytes(9).toString("base64url");
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, full_name: displayName },
  });
  if (error || !data?.user) {
    return {
      ok: false,
      error:
        error?.message ??
        "Could not create the user. If the email already exists, use 'Reset password' in their row instead.",
    };
  }

  const { error: roleErr } = await admin.from("user_roles").insert({
    user_id: data.user.id,
    restaurant_id: restaurantId,
    role,
  });
  if (roleErr) {
    return {
      ok: false,
      error: `User created but role assign failed: ${roleErr.message}`,
    };
  }

  revalidatePath(`/r/.+/admin/users`, "page");
  return generatedRequested ? { ok: true, password } : { ok: true };
}

/**
 * Reset a user's password. Useful when a cashier forgets theirs.
 */
export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  const restaurantId = parseRestaurantId(formData);
  if (!restaurantId) return { ok: false, error: "Missing restaurant context." };

  await requireRole(["admin"], { restaurantId });

  const userId = String(formData.get("user_id") ?? "");
  let password = String(formData.get("password") ?? "");
  const generatedRequested = !password;

  if (!userId) return { ok: false, error: "Missing user id." };
  if (password && password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!password) {
    password = randomBytes(9).toString("base64url");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) return { ok: false, error: error.message };

  return generatedRequested ? { ok: true, password } : { ok: true };
}

/**
 * Change a user's role WITHIN this restaurant. Doesn't affect their roles in
 * other restaurants.
 */
export async function setUserRoleAction(formData: FormData): Promise<ActionResult> {
  const restaurantId = parseRestaurantId(formData);
  if (!restaurantId) return { ok: false, error: "Missing restaurant context." };

  await requireRole(["admin"], { restaurantId });

  const userId = String(formData.get("user_id") ?? "");
  const role = String(formData.get("role") ?? "") as AppRole;

  if (!userId) return { ok: false, error: "Missing user id." };
  if (!ALLOWED.includes(role)) return { ok: false, error: "Invalid role." };

  const admin = createAdminClient();
  // Drop only roles in THIS restaurant — roles in other restaurants stay.
  const { error: delErr } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId);
  if (delErr) return { ok: false, error: delErr.message };

  const { error: insErr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, restaurant_id: restaurantId, role });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath(`/r/.+/admin/users`, "page");
  return { ok: true };
}

/**
 * Remove this user's access to THIS restaurant only. Their auth account and
 * roles in other restaurants are untouched.
 */
export async function revokeUserAction(formData: FormData): Promise<ActionResult> {
  const restaurantId = parseRestaurantId(formData);
  if (!restaurantId) return { ok: false, error: "Missing restaurant context." };

  await requireRole(["admin"], { restaurantId });

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { ok: false, error: "Missing user id." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("restaurant_id", restaurantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/.+/admin/users`, "page");
  return { ok: true };
}
