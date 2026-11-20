// Idempotent Inventory, Recipe BOM, Cash Register Shift & Multi-Tender Split Order seed script.
//
// Usage: node scripts/seed-inventory-and-shifts.mjs

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function istDateStr(offsetDays = 0) {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60 * 1000);
  ist.setUTCDate(ist.getUTCDate() + offsetDays);
  return ist.toISOString().slice(0, 10);
}

const todayDate = istDateStr(0);
const yesterdayDate = istDateStr(-1);

const { data: restaurants, error: restErr } = await admin
  .from("restaurants")
  .select("id, name, slug")
  .order("created_at", { ascending: true });

if (restErr || !restaurants?.length) {
  console.error("Could not load restaurants:", restErr?.message ?? "none found");
  process.exit(1);
}

const CAFE_MATERIALS = [
  { sku: "RM-001", name: "Arabica Espresso Roast Beans", category: "beverages", unit: "kg", stock: 18, par: 10, cost: 880 },
  { sku: "RM-002", name: "Full Cream Barista Milk", category: "dairy_oils", unit: "L", stock: 14, par: 16, cost: 68 },
  { sku: "RM-003", name: "Oat Milk (Barista Edition)", category: "beverages", unit: "L", stock: 12, par: 8, cost: 240 },
  { sku: "RM-004", name: "Artisan Sourdough Loaf", category: "grocery", unit: "pcs", stock: 24, par: 12, cost: 95 },
  { sku: "RM-005", name: "Hass Avocado (Ripe)", category: "produce", unit: "kg", stock: 4.5, par: 6, cost: 420 },
  { sku: "RM-006", name: "Mozzarella Pizza Block", category: "dairy_oils", unit: "kg", stock: 9, par: 6, cost: 520 },
  { sku: "RM-007", name: "San Marzano Pizza Sauce", category: "grocery", unit: "L", stock: 11, par: 5, cost: 210 },
  { sku: "RM-008", name: "250ml Kraft Coffee Cup + Lid", category: "packaging", unit: "pcs", stock: 180, par: 200, cost: 6.5 },
  { sku: "RM-009", name: "9-inch Kraft Pizza Box", category: "packaging", unit: "pcs", stock: 140, par: 80, cost: 16 },
  { sku: "RM-010", name: "Vanilla & Caramel Syrup", category: "beverages", unit: "L", stock: 6, par: 3, cost: 650 },
];

const ANDHRA_MATERIALS = [
  { sku: "RM-001", name: "Aged Basmati Rice (XXL)", category: "grocery", unit: "kg", stock: 48, par: 20, cost: 118 },
  { sku: "RM-002", name: "Chitti Muthyalu Short-Grain Rice", category: "grocery", unit: "kg", stock: 12, par: 15, cost: 132 },
  { sku: "RM-003", name: "Sona Masoori Steaming Rice", category: "grocery", unit: "kg", stock: 65, par: 25, cost: 64 },
  { sku: "RM-004", name: "Tender Goat Mutton (Biryani Cut)", category: "meat_seafood", unit: "kg", stock: 9, par: 10, cost: 740 },
  { sku: "RM-005", name: "Fresh Broiler Chicken", category: "meat_seafood", unit: "kg", stock: 26, par: 15, cost: 215 },
  { sku: "RM-006", name: "Fresh Malai Paneer Block", category: "dairy_oils", unit: "kg", stock: 11, par: 6, cost: 365 },
  { sku: "RM-007", name: "Pure Cow Bilona Ghee", category: "dairy_oils", unit: "L", stock: 12, par: 6, cost: 640 },
  { sku: "RM-008", name: "Guntur Sannam Red Chilli Paste", category: "spices", unit: "kg", stock: 10, par: 5, cost: 295 },
  { sku: "RM-009", name: "Fresh Red Gongura Leaves", category: "produce", unit: "kg", stock: 8.5, par: 5, cost: 85 },
  { sku: "RM-010", name: "750ml Biryani Handi Box", category: "packaging", unit: "pcs", stock: 120, par: 150, cost: 12 },
];

let totalMaterials = 0;
let totalRecipes = 0;
let totalShifts = 0;
let totalSplitOrders = 0;

for (const rest of restaurants) {
  const isCafe = rest.name.toLowerCase().includes("cafe");
  const baseCatalog = isCafe ? CAFE_MATERIALS : ANDHRA_MATERIALS;

  const [{ data: outlets }, { data: vendors }, { data: existingMats }] =
    await Promise.all([
      admin
        .from("outlets")
        .select("id, name")
        .eq("restaurant_id", rest.id)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      admin
        .from("vendors")
        .select("id, category")
        .eq("restaurant_id", rest.id),
      admin
        .from("inventory_materials")
        .select("id, sku, current_stock")
        .eq("restaurant_id", rest.id),
    ]);

  const existingBySku = new Map(
    (existingMats ?? []).map((m) => [m.sku.toUpperCase(), m]),
  );
  const defaultVendorId = vendors?.[0]?.id ?? null;
  const matIdBySku = new Map();

  for (const item of baseCatalog) {
    const found = existingBySku.get(item.sku.toUpperCase());
    if (found) {
      matIdBySku.set(item.sku, found.id);
      continue;
    }

    const vendorMatch =
      vendors?.find((v) => v.category === item.category)?.id ?? defaultVendorId;

    const { data: inserted, error } = await admin
      .from("inventory_materials")
      .insert({
        restaurant_id: rest.id,
        outlet_id: null,
        vendor_id: vendorMatch,
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        current_stock: item.stock,
        reorder_level: item.par,
        cost_per_unit: item.cost,
        status: "active",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      console.error(`Failed inserting material ${item.sku} for ${rest.slug}:`, error?.message);
      continue;
    }

    matIdBySku.set(item.sku, inserted.id);
    totalMaterials += 1;

    await admin.from("inventory_stock_movements").insert({
      restaurant_id: rest.id,
      outlet_id: null,
      material_id: inserted.id,
      movement_type: "opening",
      quantity_delta: item.stock,
      stock_after: item.stock,
      unit_cost: item.cost,
      note: "Initial seed stock balance",
      created_by: "seed-inventory-and-shifts",
    });
  }

  for (let oIdx = 0; oIdx < (outlets ?? []).length; oIdx++) {
    const outlet = outlets[oIdx];

    // Seed Product Recipes on up to 8 active menu products per outlet
    const { data: prods } = await admin
      .from("products")
      .select("id, name, veg_status")
      .eq("outlet_id", outlet.id)
      .eq("status", "active")
      .limit(8);

    const recipeRows = [];
    for (const p of prods ?? []) {
      const n = p.name.toLowerCase();
      if (isCafe) {
        const beans = matIdBySku.get("RM-001");
        const milk = matIdBySku.get("RM-002");
        const cup = matIdBySku.get("RM-008");
        const cheese = matIdBySku.get("RM-006");
        const bread = matIdBySku.get("RM-004");
        if (n.includes("pizza") && cheese && matIdBySku.get("RM-007")) {
          recipeRows.push(
            { restaurant_id: rest.id, product_id: p.id, material_id: cheese, quantity_per_unit: 0.14, wastage_pct: 5 },
            { restaurant_id: rest.id, product_id: p.id, material_id: matIdBySku.get("RM-007"), quantity_per_unit: 0.08, wastage_pct: 3 },
          );
        } else if (n.includes("toast") && bread && matIdBySku.get("RM-005")) {
          recipeRows.push(
            { restaurant_id: rest.id, product_id: p.id, material_id: bread, quantity_per_unit: 2, wastage_pct: 2 },
            { restaurant_id: rest.id, product_id: p.id, material_id: matIdBySku.get("RM-005"), quantity_per_unit: 0.12, wastage_pct: 8 },
          );
        } else if (beans && milk && cup) {
          recipeRows.push(
            { restaurant_id: rest.id, product_id: p.id, material_id: beans, quantity_per_unit: 0.018, wastage_pct: 2 },
            { restaurant_id: rest.id, product_id: p.id, material_id: milk, quantity_per_unit: 0.18, wastage_pct: 4 },
            { restaurant_id: rest.id, product_id: p.id, material_id: cup, quantity_per_unit: 1, wastage_pct: 1 },
          );
        }
      } else {
        const rice = matIdBySku.get("RM-001");
        const mutton = matIdBySku.get("RM-004");
        const chicken = matIdBySku.get("RM-005");
        const paneer = matIdBySku.get("RM-006");
        const ghee = matIdBySku.get("RM-007");
        const chilli = matIdBySku.get("RM-008");
        const box = matIdBySku.get("RM-010");
        if (n.includes("mutton") && rice && mutton && ghee) {
          recipeRows.push(
            { restaurant_id: rest.id, product_id: p.id, material_id: rice, quantity_per_unit: 0.16, wastage_pct: 4 },
            { restaurant_id: rest.id, product_id: p.id, material_id: mutton, quantity_per_unit: 0.2, wastage_pct: 6 },
            { restaurant_id: rest.id, product_id: p.id, material_id: ghee, quantity_per_unit: 0.025, wastage_pct: 2 },
          );
        } else if (n.includes("paneer") && paneer && chilli && ghee) {
          recipeRows.push(
            { restaurant_id: rest.id, product_id: p.id, material_id: paneer, quantity_per_unit: 0.18, wastage_pct: 4 },
            { restaurant_id: rest.id, product_id: p.id, material_id: chilli, quantity_per_unit: 0.02, wastage_pct: 2 },
            { restaurant_id: rest.id, product_id: p.id, material_id: ghee, quantity_per_unit: 0.02, wastage_pct: 2 },
          );
        } else if (chicken && chilli && box) {
          const isVeg = String(p.veg_status ?? "").toLowerCase() === "veg";
          if (!isVeg) {
            recipeRows.push(
              { restaurant_id: rest.id, product_id: p.id, material_id: chicken, quantity_per_unit: 0.19, wastage_pct: 5 },
              { restaurant_id: rest.id, product_id: p.id, material_id: chilli, quantity_per_unit: 0.025, wastage_pct: 2 },
            );
          } else if (rice) {
            recipeRows.push(
              { restaurant_id: rest.id, product_id: p.id, material_id: rice, quantity_per_unit: 0.15, wastage_pct: 4 },
              { restaurant_id: rest.id, product_id: p.id, material_id: box, quantity_per_unit: 1, wastage_pct: 1 },
            );
          }
        }
      }
    }

    if (recipeRows.length > 0) {
      const { error: recErr } = await admin
        .from("product_recipes")
        .upsert(recipeRows, { onConflict: "product_id,material_id" });
      if (!recErr) totalRecipes += recipeRows.length;
    }

    // Seed yesterday's closed shift + today's open shift
    const shiftPayloads = [
      {
        restaurant_id: rest.id,
        outlet_id: outlet.id,
        shift_date: yesterdayDate,
        status: "closed",
        opening_float: 5000,
        cash_sales: 8420,
        upi_sales: 12650,
        card_sales: 4300,
        tab_sales: 1200,
        online_sales: 5180,
        petty_cash_expenses: 950,
        expected_cash: 12470,
        counted_cash: 12470,
        variance: 0,
        denominations: { 500: 20, 200: 10, 100: 4, 50: 1, 20: 1, 10: 0 },
        variance_note: "Shift tallied cleanly",
        opened_by: "demo-admin@billjot.test",
        closed_by: "demo-admin@billjot.test",
        closed_at: new Date().toISOString(),
      },
      {
        restaurant_id: rest.id,
        outlet_id: outlet.id,
        shift_date: todayDate,
        status: "open",
        opening_float: 5000,
        expected_cash: 5000,
        opened_by: "demo-admin@billjot.test",
      },
    ];

    for (const sp of shiftPayloads) {
      const { data: ex } = await admin
        .from("register_shifts")
        .select("id")
        .eq("outlet_id", sp.outlet_id)
        .eq("shift_date", sp.shift_date)
        .maybeSingle();
      if (!ex) {
        const { error: shErr } = await admin.from("register_shifts").insert(sp);
        if (!shErr) totalShifts += 1;
      }
    }

    // Seed 1 sample multi-tender split POS order on primary outlet
    if (oIdx === 0) {
      const splitUid = `SPLIT-DEMO-${outlet.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
      const { data: exOrd } = await admin
        .from("orders")
        .select("id")
        .eq("unique_order_id", splitUid)
        .maybeSingle();
      if (!exOrd) {
        const firstProd = prods?.[0];
        const total = 1200;
        const { data: ord } = await admin
          .from("orders")
          .insert({
            outlet_id: outlet.id,
            source: "pos",
            customer_name: "T-04 ·Vikram (Split Demo)",
            customer_email: "vikram.demo@example.com",
            customer_phone: "+91 98490 55667",
            payment_mode: "split",
            payment_status: "paid",
            order_type: "dine-in",
            subtotal: 1142.86,
            cgst_amount: 28.57,
            sgst_amount: 28.57,
            total_amount: total,
            token_number: 412,
            status: "completed",
            unique_order_id: splitUid,
          })
          .select("id")
          .single();

        if (ord) {
          await admin.from("order_items").insert({
            order_id: ord.id,
            quantity: 2,
            unit_price: 600,
            total_price: total,
            product_config: {
              product_id: firstProd?.id ?? null,
              name: firstProd?.name ?? "Signature Platter",
              base_price: 600,
              gst_rate: 5,
              selected_options: [],
            },
          });

          await admin.from("order_payments").insert([
            {
              restaurant_id: rest.id,
              outlet_id: outlet.id,
              order_id: ord.id,
              payment_mode: "cash",
              amount: 500,
            },
            {
              restaurant_id: rest.id,
              outlet_id: outlet.id,
              order_id: ord.id,
              payment_mode: "upi",
              amount: 700,
            },
          ]);
          totalSplitOrders += 1;
        }
      }
    }
  }
}

console.log(
  `Done! Inserted ${totalMaterials} materials, upserted ${totalRecipes} recipe BOM rows, ${totalShifts} register shifts, and ${totalSplitOrders} multi-tender split demo orders.`,
);
