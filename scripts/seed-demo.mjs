// Seed a demo restaurant end-to-end: tenant, outlet, three users with known
// passwords, a coffee-cafe-that-also-serves-pizza menu, customization groups
// (sizes / milk / toppings) attached to the relevant products, and a sample
// order. Brings a fresh deployment to a fully clickable state.
//
// Usage (from project root):
//   node --env-file=.env.local scripts/seed-demo.mjs
//
// The restaurant/outlet/users are idempotent (reused + password-reset on
// re-run). The MENU is declarative: every run WIPES the demo outlet's
// categories, products, and customization groups, then re-inserts the sample
// below — so editing this file and re-running always reflects the latest set.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run with: node --env-file=.env.local scripts/seed-demo.mjs");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO = {
  slug: "billjot-demo-cafe",
  name: "Billjot Demo Cafe",
  outlet: {
    slug: "main",
    name: "Billjot Demo Cafe — MG Road",
    address: "12 MG Road, Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    state_code: "29",
    pincode: "560038",
    phone: "+91 80 1234 5678",
    gstin: "29ABCDE1234F1Z5",
    fssai_license: "12345678901234",
  },
  users: [
    { email: "demo-admin@billjot.test", name: "Asha Owner", role: "admin", password: "Admin@Demo123" },
    { email: "demo-manager@billjot.test", name: "Karthik Manager", role: "manager", password: "Manager@Demo123" },
    { email: "demo-cashier@billjot.test", name: "Priya Cashier", role: "user", password: "Cashier@Demo123" },
  ],
  categories: [
    { name: "Coffee", emoji: "☕" },
    { name: "Cakes", emoji: "🍰" },
    { name: "Pizza", emoji: "🍕" },
  ],
  // Reusable add-on sets. `groups` on a product references these by display_name.
  customizationGroups: [
    {
      display_name: "Coffee size",
      selection_type: "single",
      is_required: true,
      options: [
        { name: "Regular", price: 0 },
        { name: "Large", price: 40 },
      ],
    },
    {
      display_name: "Milk",
      selection_type: "single",
      is_required: true,
      options: [
        { name: "Whole milk", price: 0 },
        { name: "Skimmed milk", price: 0 },
        { name: "Oat milk", price: 30 },
        { name: "Almond milk", price: 30 },
      ],
    },
    {
      display_name: "Pizza size",
      selection_type: "single",
      is_required: true,
      options: [
        { name: 'Personal (7")', price: 0 },
        { name: 'Medium (10")', price: 120 },
        { name: 'Large (13")', price: 250 },
      ],
    },
    {
      display_name: "Extra toppings",
      selection_type: "multi",
      is_required: false,
      options: [
        { name: "Extra cheese", price: 50 },
        { name: "Mushroom", price: 40 },
        { name: "Black olives", price: 40 },
        { name: "Jalapeños", price: 30 },
        { name: "Grilled chicken", price: 80 },
      ],
    },
  ],
  products: [
    // Coffee — size + milk choices
    { name: "Espresso", category: "Coffee", price: 120, gst_rate: 5, veg_status: "Veg", groups: ["Coffee size", "Milk"] },
    { name: "Cappuccino", category: "Coffee", price: 150, gst_rate: 5, veg_status: "Veg", groups: ["Coffee size", "Milk"] },
    { name: "Caffè Latte", category: "Coffee", price: 160, gst_rate: 5, veg_status: "Veg", groups: ["Coffee size", "Milk"] },
    { name: "Cold Brew", category: "Coffee", price: 180, gst_rate: 5, veg_status: "Veg", groups: ["Coffee size", "Milk"] },
    // Cakes — no customizations
    { name: "Chocolate Truffle Slice", category: "Cakes", price: 140, gst_rate: 5, veg_status: "Veg" },
    { name: "Red Velvet Slice", category: "Cakes", price: 150, gst_rate: 5, veg_status: "Veg" },
    { name: "New York Cheesecake", category: "Cakes", price: 180, gst_rate: 5, veg_status: "Veg" },
    // Pizza — size + extra toppings
    { name: "Margherita Pizza", category: "Pizza", price: 250, gst_rate: 5, veg_status: "Veg", groups: ["Pizza size", "Extra toppings"] },
    { name: "Farmhouse Pizza", category: "Pizza", price: 320, gst_rate: 5, veg_status: "Veg", groups: ["Pizza size", "Extra toppings"] },
    { name: "Paneer Tikka Pizza", category: "Pizza", price: 340, gst_rate: 5, veg_status: "Veg", groups: ["Pizza size", "Extra toppings"] },
    { name: "Pepperoni Pizza", category: "Pizza", price: 360, gst_rate: 5, veg_status: "Non-Veg", groups: ["Pizza size", "Extra toppings"] },
  ],
};

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

console.log("Seeding Billjot demo restaurant…\n");

// --- 1. Restaurant (idempotent on slug) -----------------------------------
const { data: existingRest } = await admin
  .from("restaurants")
  .select("*")
  .eq("slug", DEMO.slug)
  .maybeSingle();

let restaurant;
if (existingRest) {
  console.log(`✓ Restaurant '${DEMO.slug}' already exists, reusing`);
  restaurant = existingRest;
} else {
  const { data, error } = await admin
    .from("restaurants")
    .insert({ slug: DEMO.slug, name: DEMO.name, status: "active" })
    .select()
    .single();
  if (error) {
    console.error("Failed to create restaurant:", error.message);
    process.exit(1);
  }
  restaurant = data;
  console.log(`✓ Restaurant created (id=${restaurant.id})`);
}

// --- 2. Outlet (idempotent on slug within restaurant) ---------------------
let outlet;
const { data: existingOutlet } = await admin
  .from("outlets")
  .select("*")
  .eq("restaurant_id", restaurant.id)
  .eq("slug", DEMO.outlet.slug)
  .maybeSingle();
if (existingOutlet) {
  console.log(`✓ Outlet '${DEMO.outlet.slug}' already exists, updating details`);
  await admin.from("outlets").update({ ...DEMO.outlet, restaurant_id: restaurant.id }).eq("id", existingOutlet.id);
  outlet = existingOutlet;
} else {
  const { data, error } = await admin
    .from("outlets")
    .insert({ ...DEMO.outlet, restaurant_id: restaurant.id, status: "active" })
    .select()
    .single();
  if (error) {
    console.error("Failed to create outlet:", error.message);
    process.exit(1);
  }
  outlet = data;
  console.log(`✓ Outlet created (id=${outlet.id})`);
}

// --- 3. Users (createUser is non-idempotent; we'll detect existing) ------
const { data: allUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
const emailToId = new Map((allUsers?.users ?? []).map((u) => [u.email?.toLowerCase(), u.id]));

const credentials = [];
for (const u of DEMO.users) {
  let userId = emailToId.get(u.email.toLowerCase());
  if (userId) {
    // Reset password so script output is always usable.
    await admin.auth.admin.updateUserById(userId, {
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.name, full_name: u.name },
    });
    console.log(`✓ ${u.role.padEnd(7)} ${u.email} — password reset`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { display_name: u.name, full_name: u.name },
    });
    if (error || !data?.user) {
      console.error(`Failed to create user ${u.email}:`, error?.message);
      continue;
    }
    userId = data.user.id;
    console.log(`✓ ${u.role.padEnd(7)} ${u.email} — created`);
  }

  // Assign role for this restaurant (idempotent via delete-then-insert).
  await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("restaurant_id", restaurant.id);
  await admin
    .from("user_roles")
    .insert({ user_id: userId, restaurant_id: restaurant.id, role: u.role });

  // Owner = the admin user (sets brand-page-style ownership too).
  if (u.role === "admin") {
    await admin.from("restaurants").update({ owner_user_id: userId }).eq("id", restaurant.id);
  }

  credentials.push({ ...u });
}

// --- 4. Wipe the existing menu for this outlet ----------------------------
// product_config in order_items is a JSON snapshot (no FK), so deleting
// products never orphans past orders.
{
  const { data: oldProducts } = await admin
    .from("products")
    .select("id")
    .eq("outlet_id", outlet.id);
  const oldProductIds = (oldProducts ?? []).map((p) => p.id);
  if (oldProductIds.length) {
    await admin.from("product_customizations").delete().in("product_id", oldProductIds);
  }
  await admin.from("products").delete().eq("outlet_id", outlet.id);

  const { data: oldGroups } = await admin
    .from("customization_groups")
    .select("id")
    .eq("outlet_id", outlet.id);
  const oldGroupIds = (oldGroups ?? []).map((g) => g.id);
  if (oldGroupIds.length) {
    await admin.from("customization_options").delete().in("group_id", oldGroupIds);
  }
  await admin.from("customization_groups").delete().eq("outlet_id", outlet.id);

  await admin.from("categories").delete().eq("outlet_id", outlet.id);
  console.log("✓ Cleared existing menu (categories, products, customizations)");
}

// --- 5. Categories ---------------------------------------------------------
for (let i = 0; i < DEMO.categories.length; i++) {
  const c = DEMO.categories[i];
  await admin.from("categories").insert({
    outlet_id: outlet.id,
    name: c.name,
    emoji: c.emoji,
    sort_order: (i + 1) * 10,
    status: "active",
  });
}
console.log(`✓ ${DEMO.categories.length} categories created`);

// --- 6. Customization groups + options -------------------------------------
const groupIdByName = new Map();
for (let i = 0; i < DEMO.customizationGroups.length; i++) {
  const g = DEMO.customizationGroups[i];
  const { data: grp, error } = await admin
    .from("customization_groups")
    .insert({
      outlet_id: outlet.id,
      display_name: g.display_name,
      name: slugify(g.display_name),
      selection_type: g.selection_type,
      is_required: g.is_required,
      sort_order: (i + 1) * 10,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !grp) {
    console.error(`Failed to create group ${g.display_name}:`, error?.message);
    continue;
  }
  groupIdByName.set(g.display_name, grp.id);
  await admin.from("customization_options").insert(
    g.options.map((o, oi) => ({
      group_id: grp.id,
      name: o.name,
      price: o.price,
      sort_order: (oi + 1) * 10,
      status: "active",
    })),
  );
}
console.log(`✓ ${groupIdByName.size} customization groups created`);

// --- 7. Products (+ attach customization groups) ---------------------------
let createdProducts = 0;
for (const p of DEMO.products) {
  const groups = p.groups ?? [];
  const { data: prod, error } = await admin
    .from("products")
    .insert({
      outlet_id: outlet.id,
      name: p.name,
      category: p.category,
      price: p.price,
      gst_rate: p.gst_rate,
      veg_status: p.veg_status,
      status: "active",
      has_toppings: false,
      has_addons: groups.length > 0,
      is_kot_required: true,
    })
    .select("id")
    .single();
  if (error || !prod) {
    console.error(`Failed to create product ${p.name}:`, error?.message);
    continue;
  }
  createdProducts++;

  const links = groups
    .map((gn, gi) => ({
      product_id: prod.id,
      group_id: groupIdByName.get(gn),
      sort_order: (gi + 1) * 10,
    }))
    .filter((l) => l.group_id);
  if (links.length) {
    await admin.from("product_customizations").insert(links);
  }
}
console.log(`✓ ${createdProducts} products created`);

// --- 8. A sample order so /admin/orders isn't empty -----------------------
const { data: existingOrders } = await admin
  .from("orders")
  .select("id")
  .eq("outlet_id", outlet.id)
  .limit(1);
if ((existingOrders ?? []).length === 0) {
  const { data: someProducts } = await admin
    .from("products")
    .select("*")
    .eq("outlet_id", outlet.id)
    .eq("status", "active")
    .limit(3);
  const items = (someProducts ?? []).map((p, i) => ({
    quantity: i + 1,
    unit_price: Number(p.price),
    total_price: Number(p.price) * (i + 1),
    product_config: {
      product_id: p.id,
      name: p.name,
      base_price: Number(p.price),
      gst_rate: Number(p.gst_rate ?? 5),
    },
  }));
  const subtotal = items.reduce((s, it) => s + it.total_price, 0);
  const { data: sampleOrder } = await admin
    .from("orders")
    .insert({
      outlet_id: outlet.id,
      source: "web",
      customer_name: "Demo Customer",
      customer_email: "demo@billjot.test",
      order_type: "takeaway",
      subtotal: Number((subtotal / 1.05).toFixed(2)),
      cgst_amount: Number((subtotal - subtotal / 1.05).toFixed(2)) / 2,
      sgst_amount: Number((subtotal - subtotal / 1.05).toFixed(2)) / 2,
      takeaway_charges: 0,
      total_amount: subtotal,
      status: "pending",
      unique_order_id: `BJ-DEMO-${Date.now()}`,
    })
    .select()
    .single();
  if (sampleOrder) {
    await admin.from("order_items").insert(items.map((it) => ({ order_id: sampleOrder.id, ...it })));
    console.log("✓ Sample 'pending' order seeded so /admin/orders has something to look at");
  }
} else {
  console.log("✓ Orders already exist — skipping sample order");
}

// --- Output -----------------------------------------------------------------
console.log("");
console.log("──────────────────────────────────────────────────────────");
console.log(`  Demo restaurant ready: ${DEMO.name}`);
console.log("──────────────────────────────────────────────────────────");
console.log(`  Customer storefront:   http://localhost:3000/r/${DEMO.slug}`);
console.log(`  Counter POS:           http://localhost:3000/r/${DEMO.slug}/pos`);
console.log(`  Admin orders:          http://localhost:3000/r/${DEMO.slug}/admin/orders`);
console.log(`  Admin menu:            http://localhost:3000/r/${DEMO.slug}/admin/menu`);
console.log(`  Admin settings:        http://localhost:3000/r/${DEMO.slug}/admin/settings`);
console.log(`  Sign in:               http://localhost:3000/login`);
console.log("");
console.log("  Credentials:");
for (const c of credentials) {
  console.log(`    ${c.role.padEnd(7)} ${c.email.padEnd(34)} → ${c.password}`);
}
console.log("");
console.log("  Try this flow:");
console.log("    1. Sign in as cashier → opens POS automatically → ring up a sale.");
console.log("    2. Sign in as admin → /admin/orders → click an order → mark it Preparing.");
console.log("    3. Visit the customer storefront, add to cart, checkout, see confirmation.");
console.log("");
