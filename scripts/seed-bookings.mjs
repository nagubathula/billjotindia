// Idempotent bookings & waitlist seed script:
// Upserts deterministic sample upcoming reservations (today +60m/+150m & tomorrow,
// including one paid cover deposit) and active walk-in waitlist entries per outlet.
//
// Usage: node scripts/seed-bookings.mjs

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

function isFloorTableName(name) {
  const upper = String(name || "").toUpperCase();
  return (
    !upper.includes("WALK") &&
    !upper.includes("TAKEAWAY") &&
    !upper.includes("DELIVERY") &&
    !upper.includes("PARCEL")
  );
}

const { data: restaurants, error: restErr } = await admin
  .from("restaurants")
  .select("id, name, slug")
  .order("created_at", { ascending: true });

if (restErr || !restaurants?.length) {
  console.error("Could not load restaurants:", restErr?.message ?? "none found");
  process.exit(1);
}

const nowMs = Date.now();
const isoPlusMinutes = (mins) => new Date(nowMs + mins * 60_000).toISOString();

let totalUpserted = 0;

for (const rest of restaurants) {
  const { data: outlets, error: outErr } = await admin
    .from("outlets")
    .select("id, name, city")
    .eq("restaurant_id", rest.id)
    .order("created_at", { ascending: true });

  if (outErr) {
    console.error(`Failed loading outlets for ${rest.slug}:`, outErr.message);
    process.exit(1);
  }
  if (!outlets?.length) {
    console.log(`→ Skipping ${rest.name} (${rest.slug}): no outlets found`);
    continue;
  }

  const outletIds = outlets.map((o) => o.id);
  const { data: tabsData, error: tabsErr } = await admin
    .from("pos_tabs")
    .select("id, outlet_id, name")
    .in("outlet_id", outletIds)
    .order("name", { ascending: true });

  if (tabsErr) {
    console.error(`Failed loading pos_tabs for ${rest.slug}:`, tabsErr.message);
    process.exit(1);
  }

  for (const outlet of outlets) {
    const floorTabs = (tabsData ?? []).filter(
      (t) => t.outlet_id === outlet.id && isFloorTableName(t.name),
    );
    const table1 = floorTabs[0] ?? null;
    const table2 = floorTabs[1] ?? floorTabs[0] ?? null;
    const table3 = floorTabs[2] ?? floorTabs[1] ?? floorTabs[0] ?? null;
    const tag = outlet.id.replace(/-/g, "").slice(0, 6).toUpperCase();

    const rows = [
      {
        restaurant_id: rest.id,
        outlet_id: outlet.id,
        table_id: table1?.id ?? null,
        booking_code: `RES-${tag}-01`,
        booking_type: "reservation",
        source: "web",
        status: "confirmed",
        customer_name: "Ananya Verma",
        customer_phone: "+91 98490 11223",
        customer_email: "ananya.verma@example.com",
        party_size: 4,
        preferred_zone: null,
        occasion: "Birthday",
        special_requests: "Window table if available, eggless pastry slice",
        reserved_for: isoPlusMinutes(60),
        duration_minutes: 90,
        quoted_wait_minutes: null,
        queue_number: null,
        deposit_amount: 1000,
        deposit_status: "paid",
        payment_provider: "razorpay",
        payment_reference: `pay_demo_${tag.toLowerCase()}`,
        seated_at: null,
        completed_at: null,
        cancelled_at: null,
        cancel_reason: null,
      },
      {
        restaurant_id: rest.id,
        outlet_id: outlet.id,
        table_id: table2?.id ?? null,
        booking_code: `RES-${tag}-02`,
        booking_type: "reservation",
        source: "phone",
        status: "confirmed",
        customer_name: "Karthik Reddy",
        customer_phone: "+91 98480 44556",
        customer_email: null,
        party_size: 2,
        preferred_zone: null,
        occasion: "Date Night",
        special_requests: "Quiet corner table",
        reserved_for: isoPlusMinutes(150),
        duration_minutes: 90,
        quoted_wait_minutes: null,
        queue_number: null,
        deposit_amount: 0,
        deposit_status: "none",
        payment_provider: null,
        payment_reference: null,
        seated_at: null,
        completed_at: null,
        cancelled_at: null,
        cancel_reason: null,
      },
      {
        restaurant_id: rest.id,
        outlet_id: outlet.id,
        table_id: table3?.id ?? null,
        booking_code: `RES-${tag}-03`,
        booking_type: "reservation",
        source: "admin",
        status: "confirmed",
        customer_name: "Meera Nair",
        customer_phone: "+91 99001 77889",
        customer_email: "meera.nair@example.com",
        party_size: 6,
        preferred_zone: null,
        occasion: "Family Dinner",
        special_requests: "Need 1 baby high chair",
        reserved_for: isoPlusMinutes(24 * 60 + 90),
        duration_minutes: 90,
        quoted_wait_minutes: null,
        queue_number: null,
        deposit_amount: 0,
        deposit_status: "none",
        payment_provider: null,
        payment_reference: null,
        seated_at: null,
        completed_at: null,
        cancelled_at: null,
        cancel_reason: null,
      },
      {
        restaurant_id: rest.id,
        outlet_id: outlet.id,
        table_id: null,
        booking_code: `WL-${tag}-01`,
        booking_type: "waitlist",
        source: "walk_in",
        status: "notified",
        customer_name: "Rohan Sharma",
        customer_phone: "+91 98111 33445",
        customer_email: null,
        party_size: 2,
        preferred_zone: null,
        occasion: null,
        special_requests: "Table ready notification sent",
        reserved_for: isoPlusMinutes(-12),
        duration_minutes: 90,
        quoted_wait_minutes: 10,
        queue_number: 1,
        deposit_amount: 0,
        deposit_status: "none",
        payment_provider: null,
        payment_reference: null,
        seated_at: null,
        completed_at: null,
        cancelled_at: null,
        cancel_reason: null,
      },
      {
        restaurant_id: rest.id,
        outlet_id: outlet.id,
        table_id: null,
        booking_code: `WL-${tag}-02`,
        booking_type: "waitlist",
        source: "walk_in",
        status: "waitlisted",
        customer_name: "Divya Krishnan",
        customer_phone: "+91 97000 66778",
        customer_email: null,
        party_size: 5,
        preferred_zone: null,
        occasion: null,
        special_requests: "Waiting near reception",
        reserved_for: isoPlusMinutes(-4),
        duration_minutes: 90,
        quoted_wait_minutes: 25,
        queue_number: 2,
        deposit_amount: 0,
        deposit_status: "none",
        payment_provider: null,
        payment_reference: null,
        seated_at: null,
        completed_at: null,
        cancelled_at: null,
        cancel_reason: null,
      },
    ];

    const { error: upsertErr } = await admin
      .from("table_bookings")
      .upsert(rows, { onConflict: "booking_code" });

    if (upsertErr) {
      console.error(
        `Failed upserting bookings for ${rest.slug} / ${outlet.name}:`,
        upsertErr.message,
      );
      process.exit(1);
    }

    totalUpserted += rows.length;
    console.log(
      `→ Seeded ${rows.length} bookings (3 reservations, 2 waitlist) for ${rest.name} · ${outlet.name} [tables: ${floorTabs.slice(0, 3).map((t) => t.name).join(", ") || "unassigned"}]`,
    );
  }
}

console.log(`\nDone! Upserted ${totalUpserted} booking rows cleanly.`);
