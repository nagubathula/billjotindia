// Delete a user completely — removes user_roles rows AND the auth account.
//
// Usage:
//   node --env-file=.env.local scripts/delete-user.mjs <email>
//
// Use cases:
//   - Wipe a test account before re-running signup
//   - Remove a former staff member's access entirely (not just revoke role)
//
// Does NOT delete any orders / data the user created. Just severs auth.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Use: node --env-file=.env.local scripts/delete-user.mjs <email>");
  process.exit(1);
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("usage: delete-user.mjs <email>");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Find the user.
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
  console.log(`No user with email ${email} — nothing to do.`);
  process.exit(0);
}

console.log(`Found user_id: ${existing.id}`);

// Delete user_roles first (FK from user_roles → profiles or users).
const { error: rolesErr } = await admin
  .from("user_roles")
  .delete()
  .eq("user_id", existing.id);
if (rolesErr) {
  console.error("Failed to delete user_roles:", rolesErr.message);
  process.exit(1);
}
console.log("✓ user_roles cleared");

// Delete the auth account.
const { error: delErr } = await admin.auth.admin.deleteUser(existing.id);
if (delErr) {
  console.error("Failed to delete auth user:", delErr.message);
  process.exit(1);
}
console.log("✓ auth user deleted");
console.log("");
console.log(`Done. ${email} no longer exists.`);
