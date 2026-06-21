// Seed TWO extra cafés (full menus + ~140 historical bills) under the demo
// admin (Asha), so the dashboard, Orders and Reports/analytics look rich for
// a live demo. Complements scripts/seed-demo.mjs (which seeds the first cafe).
//
// Usage (from project root):
//   node --env-file=.env.local scripts/seed-cafes.mjs
//
// Re-run safe: a café is skipped if one with the same name already exists for
// the owner (so it won't double-create or pile up duplicate orders).

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/seed-cafes.mjs");
  process.exit(1);
}
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OWNER_EMAIL = "demo-admin@billjot.test";
const GST_RATE = 5;

const slugify = (s) =>
  `${s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const weighted = (pairs) => {
  let r = Math.random() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};

const SOURCES = [["pos", 50], ["web", 25], ["zomato", 15], ["swiggy", 10]];
const STATUSES = [["completed", 88], ["cancelled", 4], ["ready", 4], ["pending", 4]];
const ORDER_TYPES = [["dine-in", 50], ["takeaway", 35], ["delivery", 15]];
const NAMES = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Sara", "Vivaan", "Anaya", "Ishaan", "Tara"];

const CAFES = [
  {
    name: "Brew & Bytes Café",
    outlet: { city: "Bengaluru", state: "Karnataka", state_code: "29", pincode: "560034", phone: "+91 80 4123 7788", gstin: "29ABCDE1234F1Z5", address: "12, 5th Block, Koramangala", fssai_license: "10020031122334" },
    menu: {
      Coffee: [["Espresso", 120], ["Cappuccino", 160], ["Café Latte", 170], ["Flat White", 180], ["Cold Brew", 200], ["Mocha", 210]],
      "Tea & More": [["Masala Chai", 80], ["Green Tea", 90], ["Hot Chocolate", 160]],
      Bites: [["Veg Club Sandwich", 150], ["Paneer Tikka Wrap", 190], ["Chicken Wrap", 220, "Non-Veg"], ["Peri Peri Fries", 120]],
      Desserts: [["Choco Lava Cake", 180], ["Blueberry Cheesecake", 220], ["Walnut Brownie", 140]],
    },
  },
  {
    name: "Sunrise Coffee Co.",
    outlet: { city: "Hyderabad", state: "Telangana", state_code: "36", pincode: "500033", phone: "+91 40 2987 5566", gstin: "36PQRST5678K1Z2", address: "Plot 7, Jubilee Hills", fssai_license: "10020055667788" },
    menu: {
      Brews: [["Filter Coffee", 60], ["Americano", 140], ["Caramel Macchiato", 220], ["Iced Latte", 190]],
      Breakfast: [["Masala Dosa", 120], ["Idli Vada", 100], ["Poha", 80], ["Aloo Paratha", 110]],
      "All-Day": [["Maggi Masala", 90], ["Veg Burger", 140], ["Grilled Cheese", 160], ["Pasta Alfredo", 230]],
      Sweets: [["Gulab Jamun", 70], ["Carrot Cake", 200], ["Choco Chip Cookie", 60]],
    },
  },
];

async function findOwner() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const u = (data?.users ?? []).find((x) => x.email?.toLowerCase() === OWNER_EMAIL);
  if (!u) throw new Error(`Owner ${OWNER_EMAIL} not found. Run seed-demo.mjs first.`);
  return u.id;
}

async function seedCafe(ownerId, cafe) {
  const { data: existing } = await admin
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", ownerId)
    .eq("name", cafe.name)
    .maybeSingle();
  if (existing) {
    console.log(`• "${cafe.name}" already exists — skipping.`);
    return;
  }

  const slug = slugify(cafe.name);
  const { data: rest, error: rErr } = await admin
    .from("restaurants")
    .insert({ slug, name: cafe.name, status: "active", owner_user_id: ownerId })
    .select()
    .single();
  if (rErr || !rest) throw new Error(`restaurant: ${rErr?.message}`);

  // outlets.slug is GLOBALLY unique — derive it from the restaurant slug.
  const { data: outlet, error: oErr } = await admin
    .from("outlets")
    .insert({ restaurant_id: rest.id, slug: `${slug}-main`, name: `${cafe.name} — Main`, status: "active", currency: "INR", ...cafe.outlet })
    .select()
    .single();
  if (oErr || !outlet) {
    await admin.from("restaurants").delete().eq("id", rest.id);
    throw new Error(`outlet: ${oErr?.message}`);
  }

  await admin.from("user_roles").insert({ user_id: ownerId, restaurant_id: rest.id, role: "admin" });

  const cats = Object.keys(cafe.menu);
  await admin.from("categories").insert(
    cats.map((name, i) => ({ outlet_id: outlet.id, name, sort_order: (i + 1) * 10, status: "active" })),
  );

  const payload = [];
  for (const [cat, items] of Object.entries(cafe.menu)) {
    for (const [name, price, veg] of items) {
      payload.push({ outlet_id: outlet.id, category: cat, name, price, gst_rate: GST_RATE, hsn_code: "210690", veg_status: veg ?? "Veg", status: "active", is_kot_required: true });
    }
  }
  const { data: products } = await admin.from("products").insert(payload).select();

  // ---- historical orders over the last 30 days ----
  const orders = [];
  const itemsByUid = {};
  let seq = 0;
  const target = rand(60, 80);

  for (let i = 0; i < target; i++) {
    const daysAgo = rand(0, 29);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(rand(8, 21), rand(0, 59), rand(0, 59), 0);
    const ts = d.toISOString();

    const pool = [...products];
    const lines = [];
    const n = rand(1, 4);
    let total = 0, gst = 0;
    for (let k = 0; k < n && pool.length; k++) {
      const p = pool.splice(rand(0, pool.length - 1), 1)[0];
      const qty = rand(1, 3);
      const line = Number(p.price) * qty;
      total += line;
      gst += line - line / (1 + GST_RATE / 100);
      lines.push({
        quantity: qty,
        unit_price: Number(p.price),
        total_price: line,
        product_config: { product_id: p.id, name: p.name, base_price: Number(p.price), gst_rate: GST_RATE, hsn_code: p.hsn_code },
      });
    }

    const source = weighted(SOURCES);
    const uid = `BJ-${rest.id}-${String(++seq).padStart(4, "0")}`;
    itemsByUid[uid] = lines;
    orders.push({
      outlet_id: outlet.id,
      unique_order_id: uid,
      source,
      status: weighted(STATUSES),
      order_type: weighted(ORDER_TYPES),
      customer_name: source === "pos" ? "Counter" : pick(NAMES),
      customer_email: `guest+${source}@billjot.local`,
      subtotal: Number((total - gst).toFixed(2)),
      cgst_amount: Number((gst / 2).toFixed(2)),
      sgst_amount: Number((gst / 2).toFixed(2)),
      igst_amount: 0,
      takeaway_charges: 0,
      total_amount: Number(total.toFixed(2)),
      placed_at: ts,
      created_at: ts,
      updated_at: ts,
    });
  }

  const { data: inserted, error: ordErr } = await admin
    .from("orders")
    .insert(orders)
    .select("id, unique_order_id, status, total_amount");
  if (ordErr) throw ordErr;

  const idByUid = new Map(inserted.map((o) => [o.unique_order_id, o.id]));
  const rows = [];
  for (const [uid, lines] of Object.entries(itemsByUid)) {
    const oid = idByUid.get(uid);
    for (const l of lines) rows.push({ order_id: oid, ...l });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("order_items").insert(rows.slice(i, i + 200));
    if (error) throw error;
  }

  const revenue = inserted.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total_amount), 0);
  console.log(`✓ ${cafe.name}  (/r/${slug})  —  ${products.length} items, ${inserted.length} bills, ₹${Math.round(revenue).toLocaleString("en-IN")} revenue (30d)`);
}

const ownerId = await findOwner();
console.log("Seeding extra cafés for owner:", ownerId, "\n");
for (const cafe of CAFES) await seedCafe(ownerId, cafe);
console.log("\nDone. Refresh your dashboard — you should now have 3 restaurants.");
