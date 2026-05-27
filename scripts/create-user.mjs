// Create a staff user directly with email + password. No invite email,
// no confirmation step — admin sets the password and shares it securely.
// Idempotent: if the email already exists, the password is reset and the
// role is reapplied.
//
// Usage (from project root):
//   node --env-file=.env.local scripts/create-user.mjs <email> [role] [password] [name] [restaurant_slug]
//
// Examples:
//   node --env-file=.env.local scripts/create-user.mjs satya@x.com admin
//     → creates with a generated password, name derived from email, default restaurant.
//   node --env-file=.env.local scripts/create-user.mjs cashier@x.com user MyPass123! 'Priya K' coffee-day-a3b
//     → adds Priya as a cashier of the 'coffee-day-a3b' restaurant.
//
// Defaults to the 'default' restaurant slug — useful for the legacy seeded
// tenant. For SaaS sign-ups, pass the explicit slug.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing env. Run with: node --env-file=.env.local scripts/create-user.mjs <email> [role] [password]",
  );
  process.exit(1);
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
const role = (process.argv[3] ?? "admin").trim();
let password = (process.argv[4] ?? "").trim();
const explicitName = (process.argv[5] ?? "").trim();
const restaurantSlug = (process.argv[6] ?? "default").trim();

const ALLOWED = ["admin", "manager", "user"];
if (!email || !email.includes("@")) {
  console.error("usage: create-user.mjs <email> [admin|manager|user] [password] [name]");
  process.exit(1);
}

// Derive a sensible default name from email local-part: 'satya.sai' → 'Satya Sai'.
const derivedName = email
  .split("@")[0]
  .split(/[._-]+/)
  .filter(Boolean)
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join(" ");
const displayName = explicitName || derivedName;
if (!ALLOWED.includes(role)) {
  console.error(`role must be one of: ${ALLOWED.join(", ")}`);
  process.exit(1);
}

let generated = false;
if (!password) {
  // 12 chars, base64-url-safe, with at least one digit and one letter (very
  // likely given base64 distribution but we don't enforce — Supabase only
  // requires 6+ chars by default).
  password = randomBytes(9).toString("base64url");
  generated = true;
}
if (password.length < 8) {
  console.error("password must be at least 8 characters");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- 1. Find or create the user --------------------------------------------
let userId;
let action;

const { data: createRes, error: createErr } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // skip the email confirmation step entirely
  user_metadata: { display_name: displayName, full_name: displayName },
});

if (createRes?.user) {
  userId = createRes.user.id;
  action = "created";
} else {
  // User already exists — find them and reset password instead.
  console.log(`Create skipped: ${createErr?.message ?? "user exists"}`);

  const { data: listRes, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    console.error("listUsers failed:", listErr.message);
    process.exit(1);
  }
  const existing = listRes.users.find((u) => u.email?.toLowerCase() === email);
  if (!existing) {
    console.error(`Could not create and could not find user ${email}.`);
    process.exit(1);
  }
  userId = existing.id;

  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, full_name: displayName },
  });
  if (updateErr) {
    console.error("Password reset failed:", updateErr.message);
    process.exit(1);
  }
  action = "password reset";
}

console.log(`✓ User ${action}`);
console.log(`  name:    ${displayName}`);
console.log(`  email:   ${email}`);
console.log(`  user_id: ${userId}`);

// --- 2. Assign role (replace any existing roles for this user) -------------
const { error: delErr } = await admin
  .from("user_roles")
  .delete()
  .eq("user_id", userId);
if (delErr) {
  console.error("Failed to clear existing roles:", delErr.message);
  process.exit(1);
}

// Resolve restaurant by slug.
const { data: restaurant, error: restErr } = await admin
  .from("restaurants")
  .select("id, name")
  .eq("slug", restaurantSlug)
  .maybeSingle();
if (restErr || !restaurant) {
  console.error(
    `Restaurant with slug '${restaurantSlug}' not found. Available slugs:`,
  );
  const { data: all } = await admin.from("restaurants").select("slug, name");
  for (const r of all ?? []) console.error(`  - ${r.slug}  (${r.name})`);
  process.exit(1);
}

const { error: insErr } = await admin
  .from("user_roles")
  .insert({ user_id: userId, restaurant_id: restaurant.id, role });
if (insErr) {
  console.error("Failed to assign role:", insErr.message);
  process.exit(1);
}

console.log(`✓ Role '${role}' assigned in restaurant '${restaurantSlug}' (${restaurant.name})`);
console.log("");

if (generated) {
  console.log("🔑 Generated password (share via secure channel, shown once):");
  console.log("");
  console.log("   " + password);
  console.log("");
}
console.log(`The user can now sign in at /login with:`);
console.log(`   email:    ${email}`);
console.log(`   password: ${generated ? "(above)" : "(the one you supplied)"}`);
