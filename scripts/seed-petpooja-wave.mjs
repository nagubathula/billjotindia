// Idempotent Petpooja Parity Wave seed script (NO WhatsApp):
// - Thermal Printers (with RJ11 cash drawer kick on counter printer)
// - Kitchen Stations (Main Kitchen, Tandoor & Grill, Beverage & Bar, Desserts & Bakery)
// - Default category/product kitchen station routing
// - Phone-number Loyalty Program rules, sample wallets & transactions
//
// Usage: node scripts/seed-petpooja-wave.mjs

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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SAMPLE_WALLETS = [
  { phone: "9876543210", name: "Asha Reddy", pts: 185, earned: 310, redeemed: 125, visits: 9, spent: 6200 },
  { phone: "9848012345", name: "Vikram Rao", pts: 95, earned: 145, redeemed: 50, visits: 5, spent: 2900 },
  { phone: "9908112233", name: "Sneha Nair", pts: 240, earned: 240, redeemed: 0, visits: 7, spent: 4800 },
  { phone: "9885044556", name: "Karthik Sharma", pts: 60, earned: 110, redeemed: 50, visits: 4, spent: 2200 },
  { phone: "9701233445", name: "Divya Menon", pts: 315, earned: 415, redeemed: 100, visits: 12, spent: 8300 },
  { phone: "9849055667", name: "Rohan Verma", pts: 45, earned: 45, redeemed: 0, visits: 2, spent: 900 },
  { phone: "9000177889", name: "Priya Iyer", pts: 130, earned: 205, redeemed: 75, visits: 6, spent: 4100 },
  { phone: "9177288990", name: "Arjun Kapoor", pts: 75, earned: 75, redeemed: 0, visits: 3, spent: 1500 },
  { phone: "9949300112", name: "Meera Krishnan", pts: 210, earned: 260, redeemed: 50, visits: 8, spent: 5200 },
  { phone: "9652411223", name: "Siddharth Joshi", pts: 150, earned: 150, redeemed: 0, visits: 4, spent: 3000 },
];

function inferStationForCategory(categoryName) {
  const s = (categoryName || "").toLowerCase();
  if (/tandoor|roti|naan|bread|kulcha|paratha|kebab|grill|tikka/.test(s)) {
    return "Tandoor & Grill";
  }
  if (/beverage|drink|juice|coffee|tea|chai|lassi|shake|bar|mocktail|cooler/.test(s)) {
    return "Beverage & Bar";
  }
  if (/dessert|sweet|cake|pastry|bakery|ice\s*cream|gulab|kheer/.test(s)) {
    return "Desserts & Bakery";
  }
  return "Main Kitchen";
}

async function run() {
  const { data: restaurants, error: restErr } = await admin
    .from("restaurants")
    .select("id, name, slug")
    .order("name");
  if (restErr) throw restErr;

  let printersSeeded = 0;
  let stationsSeeded = 0;
  let categoryLinks = 0;
  let productLinks = 0;
  let walletsSeeded = 0;

  for (const r of restaurants ?? []) {
    // 1. Loyalty program rules + wallets
    await admin.from("loyalty_settings").upsert(
      {
        restaurant_id: r.id,
        is_enabled: true,
        points_per_100: 5,
        point_value: 1,
        min_order_for_earn: 100,
        min_points_to_redeem: 25,
        max_redeem_pct: 25,
        welcome_bonus_points: 25,
      },
      { onConflict: "restaurant_id" },
    );

    const { data: existingWallets } = await admin
      .from("loyalty_wallets")
      .select("phone_normalized")
      .eq("restaurant_id", r.id);
    const existingPhones = new Set((existingWallets ?? []).map((w) => w.phone_normalized));

    for (const sw of SAMPLE_WALLETS) {
      if (existingPhones.has(sw.phone)) continue;
      const { data: insertedWallet } = await admin
        .from("loyalty_wallets")
        .insert({
          restaurant_id: r.id,
          phone_normalized: sw.phone,
          customer_name: sw.name,
          points_balance: sw.pts,
          lifetime_earned: sw.earned,
          lifetime_redeemed: sw.redeemed,
          visits_count: sw.visits,
          total_spent: sw.spent,
          last_visit_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertedWallet) {
        walletsSeeded += 1;
        await admin.from("loyalty_transactions").insert([
          {
            restaurant_id: r.id,
            wallet_id: insertedWallet.id,
            txn_type: "welcome_bonus",
            points_delta: 25,
            rupee_value: 25,
            balance_after: 25,
            note: "Initial enrollment bonus",
          },
          {
            restaurant_id: r.id,
            wallet_id: insertedWallet.id,
            txn_type: "adjustment",
            points_delta: sw.pts - 25,
            rupee_value: Math.max(0, sw.pts - 25),
            balance_after: sw.pts,
            note: "Opening seeded loyalty points",
          },
        ]);
      }
    }

    // 2. Outlets: printers, kitchen stations, category & product links
    const { data: outlets } = await admin
      .from("outlets")
      .select("id, name")
      .eq("restaurant_id", r.id);

    for (const o of outlets ?? []) {
      const { data: existingPrinters } = await admin
        .from("printers")
        .select("id, name")
        .eq("outlet_id", o.id);
      const printerIdByName = new Map(
        (existingPrinters ?? []).map((p) => [p.name, p.id]),
      );

      const printerDefs = [
        {
          name: "Counter 80mm Receipt",
          purpose: "bill",
          interface: "usb",
          address: "USB-001",
          paper_width: 80,
          kick_cash_drawer: true,
        },
        {
          name: "Main Kitchen Thermal",
          purpose: "kot",
          interface: "network",
          address: "192.168.1.51:9100",
          paper_width: 80,
          kick_cash_drawer: false,
        },
        {
          name: "Tandoor KOT Printer",
          purpose: "kot",
          interface: "network",
          address: "192.168.1.52:9100",
          paper_width: 80,
          kick_cash_drawer: false,
        },
        {
          name: "Beverage Bar Printer",
          purpose: "kot",
          interface: "network",
          address: "192.168.1.53:9100",
          paper_width: 58,
          kick_cash_drawer: false,
        },
      ];

      for (const pd of printerDefs) {
        if (!printerIdByName.has(pd.name)) {
          const { data: pr } = await admin
            .from("printers")
            .insert({ ...pd, outlet_id: o.id, status: "active" })
            .select("id, name")
            .single();
          if (pr) {
            printerIdByName.set(pr.name, pr.id);
            printersSeeded += 1;
          }
        }
      }

      const stationDefs = [
        { name: "Main Kitchen", printerName: "Main Kitchen Thermal", sort_order: 10 },
        { name: "Tandoor & Grill", printerName: "Tandoor KOT Printer", sort_order: 20 },
        { name: "Beverage & Bar", printerName: "Beverage Bar Printer", sort_order: 30 },
        { name: "Desserts & Bakery", printerName: "Beverage Bar Printer", sort_order: 40 },
      ];

      for (const sd of stationDefs) {
        const printerId = printerIdByName.get(sd.printerName) ?? null;
        await admin.from("kitchen_stations").upsert(
          {
            outlet_id: o.id,
            name: sd.name,
            printer_id: printerId,
            sort_order: sd.sort_order,
            status: "active",
          },
          { onConflict: "outlet_id,name" },
        );
      }

      const { data: stRows } = await admin
        .from("kitchen_stations")
        .select("id, name")
        .eq("outlet_id", o.id);
      const stationIdByName = new Map((stRows ?? []).map((s) => [s.name, s.id]));
      stationsSeeded += (stRows ?? []).length;

      const { data: cats } = await admin
        .from("categories")
        .select("id, name, station_id")
        .eq("outlet_id", o.id);
      for (const c of cats ?? []) {
        if (c.station_id) continue;
        const targetName = inferStationForCategory(c.name);
        const stId = stationIdByName.get(targetName) ?? null;
        if (stId) {
          await admin.from("categories").update({ station_id: stId }).eq("id", c.id);
          categoryLinks += 1;
        }
      }

      const { data: prods } = await admin
        .from("products")
        .select("id, name, category, station_id")
        .eq("outlet_id", o.id);
      for (const p of prods ?? []) {
        if (p.station_id) continue;
        if (/water|cola|soda|bottle|tin/i.test(p.name)) {
          const barId = stationIdByName.get("Beverage & Bar");
          if (barId) {
            await admin
              .from("products")
              .update({ station_id: barId, is_kot_required: false })
              .eq("id", p.id);
            productLinks += 1;
          }
        }
      }
    }
  }

  console.log(
    `Done! Seeded ${printersSeeded} printers, ensured ${stationsSeeded} station rows, linked ${categoryLinks} categories & ${productLinks} product overrides, and seeded ${walletsSeeded} loyalty wallets.`,
  );
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
