// Create dedicated staff logins (admin / manager / cashier) for the
// Manaruchulu restaurant. Idempotent: reuses existing users and resets their
// password so the printed credentials always work.
//
// Usage:  node --env-file=.env.local scripts/seed-manaruchulu-users.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/seed-manaruchulu-users.mjs");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const SLUG = "manaruchulu";
const USERS = [
  { email: "manaruchulu-admin@billjot.test", name: "Ravi (Owner)", role: "admin", password: "Admin@Mana123" },
  { email: "manaruchulu-manager@billjot.test", name: "Lakshmi (Manager)", role: "manager", password: "Manager@Mana123" },
  { email: "manaruchulu-cashier@billjot.test", name: "Suresh (Cashier)", role: "user", password: "Cashier@Mana123" },
];

const { data: rest } = await admin
  .from("restaurants")
  .select("id, slug, name")
  .eq("slug", SLUG)
  .maybeSingle();
if (!rest) {
  console.error(`Restaurant '${SLUG}' not found. Run seed-manaruchulu.mjs first.`);
  process.exit(1);
}

const { data: all } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
const byEmail = new Map((all?.users ?? []).map((u) => [u.email?.toLowerCase(), u.id]));

for (const u of USERS) {
  let id = byEmail.get(u.email.toLowerCase());
  if (id) {
    await admin.auth.admin.updateUserById(id, {
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.name, full_name: u.name },
    });
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.name, full_name: u.name },
    });
    if (error || !data?.user) {
      console.error(`Failed to create ${u.email}:`, error?.message);
      continue;
    }
    id = data.user.id;
  }
  // Assign role for this restaurant (idempotent).
  await admin.from("user_roles").delete().eq("user_id", id).eq("restaurant_id", rest.id);
  await admin.from("user_roles").insert({ user_id: id, restaurant_id: rest.id, role: u.role });
  console.log(`✓ ${u.role.padEnd(7)} ${u.email}  →  ${u.password}`);
}

console.log(`\nAll set for "${rest.name}" (/r/${rest.slug}).`);
