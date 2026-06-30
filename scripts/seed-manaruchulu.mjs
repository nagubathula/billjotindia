// Create the "Manaruchulu" restaurant (Telugu home-style / South Indian) under
// the demo admin (Asha): restaurant + default outlet + admin role + a starter
// menu so the POS and storefront work immediately.
//
// Usage:  node --env-file=.env.local scripts/seed-manaruchulu.mjs
// Re-run safe: skips if a restaurant with this name already exists for the owner.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/seed-manaruchulu.mjs");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const OWNER_EMAIL = "demo-admin@billjot.test";
const NAME = "Manaruchulu";
const GST_RATE = 5;
const rand4 = () => Math.random().toString(36).slice(2, 6);

const OUTLET = {
  city: "Hyderabad",
  state: "Telangana",
  state_code: "36",
  pincode: "500081",
  phone: "+91 40 4567 1199",
  gstin: "36MANAR1234C1Z9",
  address: "Road No. 2, Banjara Hills",
  fssai_license: "10021045566778",
};

const MENU = {
  Tiffins: [["Idli (2 pc)", 40], ["Medu Vada (2 pc)", 50], ["Masala Dosa", 90], ["Plain Dosa", 70], ["Upma", 60], ["Pesarattu", 90]],
  Meals: [["Veg Meals", 140], ["Special Thali", 220], ["Curd Rice", 80]],
  Curries: [["Gutti Vankaya", 160], ["Pappu (Dal)", 120], ["Kodi Kura (Chicken)", 220, "Non-Veg"]],
  Beverages: [["Filter Coffee", 40], ["Buttermilk", 30], ["Masala Chai", 30]],
};

const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
const owner = (users?.users ?? []).find((u) => u.email?.toLowerCase() === OWNER_EMAIL);
if (!owner) {
  console.error(`Owner ${OWNER_EMAIL} not found. Run seed-demo.mjs first.`);
  process.exit(1);
}

const { data: existing } = await admin
  .from("restaurants")
  .select("id, slug")
  .eq("owner_user_id", owner.id)
  .eq("name", NAME)
  .maybeSingle();
if (existing) {
  console.log(`• "${NAME}" already exists at /r/${existing.slug} — skipping.`);
  process.exit(0);
}

// Prefer the clean slug "manaruchulu"; fall back to a suffixed one if taken.
let slug = "manaruchulu";
const { data: clash } = await admin.from("restaurants").select("id").eq("slug", slug).maybeSingle();
if (clash) slug = `manaruchulu-${rand4()}`;

const { data: rest, error: rErr } = await admin
  .from("restaurants")
  .insert({ slug, name: NAME, status: "active", owner_user_id: owner.id })
  .select()
  .single();
if (rErr) throw rErr;

// outlets.slug is GLOBALLY unique.
const { data: outlet, error: oErr } = await admin
  .from("outlets")
  .insert({ restaurant_id: rest.id, slug: `${slug}-main`, name: `${NAME} — Main`, status: "active", currency: "INR", ...OUTLET })
  .select()
  .single();
if (oErr) {
  await admin.from("restaurants").delete().eq("id", rest.id);
  throw oErr;
}

await admin.from("user_roles").insert({ user_id: owner.id, restaurant_id: rest.id, role: "admin" });

const cats = Object.keys(MENU);
await admin.from("categories").insert(
  cats.map((name, i) => ({ outlet_id: outlet.id, name, sort_order: (i + 1) * 10, status: "active" })),
);

const productsPayload = [];
for (const [cat, items] of Object.entries(MENU)) {
  for (const [name, price, veg] of items) {
    productsPayload.push({
      outlet_id: outlet.id,
      category: cat,
      name,
      price,
      gst_rate: GST_RATE,
      hsn_code: "210690",
      veg_status: veg ?? "Veg",
      status: "active",
      is_kot_required: true,
    });
  }
}
const { data: products, error: pErr } = await admin.from("products").insert(productsPayload).select("id");
if (pErr) throw pErr;

console.log(`✓ Created "${NAME}"`);
console.log(`  Storefront: /r/${slug}`);
console.log(`  POS:        /r/${slug}/pos`);
console.log(`  Admin:      /r/${slug}/admin/menu`);
console.log(`  ${products.length} menu items across ${cats.length} categories. Owner: ${OWNER_EMAIL} (admin).`);
