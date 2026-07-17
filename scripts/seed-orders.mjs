import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/seed-orders.mjs");
  process.exit(1);
}
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const GST_RATE = 5;
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

async function seedOrdersForOutlet(outletId, restaurantId, restaurantName, target = 60) {
  const { data: existingOrders } = await admin.from("orders").select("id").eq("outlet_id", outletId);
  if (existingOrders && existingOrders.length > 10) {
    console.log(`• "${restaurantName}" already has ${existingOrders.length} orders — skipping.`);
    return;
  }

  const { data: products } = await admin.from("products").select("*").eq("outlet_id", outletId).eq("status", "active");
  if (!products || products.length === 0) {
    console.log(`• "${restaurantName}" has no products — skipping.`);
    return;
  }

  console.log(`Seeding ~${target} orders for "${restaurantName}"...`);
  const orders = [];
  const itemsByUid = {};
  let seq = 0;

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
        product_config: { product_id: p.id, name: p.name, base_price: Number(p.price), gst_rate: GST_RATE, hsn_code: p.hsn_code || "210690" },
      });
    }

    const source = weighted(SOURCES);
    const uid = `BJ-${restaurantId}-${String(++seq).padStart(4, "0")}-${Date.now().toString().slice(-4)}`;
    itemsByUid[uid] = lines;
    orders.push({
      outlet_id: outletId,
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
  if (ordErr) {
    console.error(`Failed to insert orders for ${restaurantName}:`, ordErr.message);
    return;
  }

  const idByUid = new Map(inserted.map((o) => [o.unique_order_id, o.id]));
  const rows = [];
  for (const [uid, lines] of Object.entries(itemsByUid)) {
    const oid = idByUid.get(uid);
    for (const l of lines) rows.push({ order_id: oid, ...l });
  }
  
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await admin.from("order_items").insert(rows.slice(i, i + 200));
    if (error) console.error(`Failed to insert order items:`, error.message);
  }

  const revenue = inserted.filter((o) => o.status !== "cancelled").reduce((s, o) => s + Number(o.total_amount), 0);
  console.log(`✓ ${restaurantName}  —  Seeded ${inserted.length} historical bills, ₹${Math.round(revenue).toLocaleString("en-IN")} revenue (30d)`);
}

async function run() {
  const { data: outlets } = await admin.from("outlets").select("id, restaurant_id, name");
  if (!outlets) return;

  for (const outlet of outlets) {
    // Determine a random target for realistic variance
    const target = rand(50, 90);
    await seedOrdersForOutlet(outlet.id, outlet.restaurant_id, outlet.name, target);
  }
  
  console.log("\nDone seeding missing historical orders.");
}

run();
