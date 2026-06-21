// Assign realistic, distinct customers (with repeat "regulars") to existing
// non-POS orders across the demo owner's outlets — so the Customers database
// and customer analytics have real people with order history.
//
// Usage:  node --env-file=.env.local scripts/seed-customers.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/seed-customers.mjs");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const OWNER_EMAIL = "demo-admin@billjot.test";

// First 6 are "regulars" (weighted to receive more orders → repeat customers).
const POOL = [
  { name: "Aarav Sharma", email: "aarav.sharma@gmail.com" },
  { name: "Diya Menon", email: "diya.menon@gmail.com" },
  { name: "Kabir Anand", email: "kabir.anand@outlook.com" },
  { name: "Meera Iyer", email: "meera.iyer@gmail.com" },
  { name: "Rohan Gupta", email: "rohan.gupta@yahoo.com" },
  { name: "Sara Khan", email: "sara.khan@gmail.com" },
  { name: "Vivaan Reddy", email: "vivaan.reddy@gmail.com" },
  { name: "Anaya Nair", email: "anaya.nair@outlook.com" },
  { name: "Ishaan Verma", email: "ishaan.verma@gmail.com" },
  { name: "Tara Joshi", email: "tara.joshi@gmail.com" },
  { name: "Aditya Rao", email: "aditya.rao@gmail.com" },
  { name: "Nisha Pillai", email: "nisha.pillai@yahoo.com" },
  { name: "Arjun Desai", email: "arjun.desai@gmail.com" },
  { name: "Riya Kapoor", email: "riya.kapoor@gmail.com" },
  { name: "Karan Malhotra", email: "karan.malhotra@outlook.com" },
  { name: "Pooja Shetty", email: "pooja.shetty@gmail.com" },
  { name: "Dev Patel", email: "dev.patel@gmail.com" },
  { name: "Sneha Bose", email: "sneha.bose@gmail.com" },
];
const REGULARS = 6;
const pickCustomer = () => {
  // 62% of orders go to a regular → builds repeat history.
  if (Math.random() < 0.62) return POOL[Math.floor(Math.random() * REGULARS)];
  return POOL[REGULARS + Math.floor(Math.random() * (POOL.length - REGULARS))];
};

const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
const owner = (users?.users ?? []).find((u) => u.email?.toLowerCase() === OWNER_EMAIL);
if (!owner) {
  console.error(`Owner ${OWNER_EMAIL} not found.`);
  process.exit(1);
}

const { data: rests } = await admin
  .from("restaurants")
  .select("id, name")
  .eq("owner_user_id", owner.id);
const restIds = rests.map((r) => r.id);
const { data: outlets } = await admin
  .from("outlets")
  .select("id")
  .in("restaurant_id", restIds);
const outletIds = outlets.map((o) => o.id);

// Only re-label non-POS orders (POS = walk-in "Counter").
const { data: orders } = await admin
  .from("orders")
  .select("id")
  .in("outlet_id", outletIds)
  .neq("source", "pos");

let updated = 0;
for (const o of orders) {
  const c = pickCustomer();
  const { error } = await admin
    .from("orders")
    .update({ customer_name: c.name, customer_email: c.email })
    .eq("id", o.id);
  if (!error) updated++;
}

console.log(`✓ Assigned realistic customers to ${updated} non-POS orders across ${outletIds.length} outlets.`);
console.log(`  Customer pool: ${POOL.length} people (${REGULARS} regulars).`);
console.log("\nDone. Open admin → Customers on a café to see the database.");
