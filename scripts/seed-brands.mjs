// Seed demo brands under the demo admin (Asha). A brand groups multiple
// restaurants you run as franchises (restaurants.brand_id -> brands.id).
//
// Creates:
//   • "Urban Roast Collective" — a 2-outlet franchise (Brew & Bytes + Sunrise)
//   • "Daybreak Hospitality"   — an empty brand to grow live in the demo
//
// Usage:  node --env-file=.env.local scripts/seed-brands.mjs
// Re-run safe: a brand is skipped if one with the same name already exists.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/seed-brands.mjs");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const OWNER_EMAIL = "demo-admin@billjot.test";
const slugify = (s) =>
  `${s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;

const BRANDS = [
  { name: "Urban Roast Collective", attach: ["Brew & Bytes Café", "Sunrise Coffee Co."] },
  { name: "Daybreak Hospitality", attach: [] },
];

const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
const owner = (users?.users ?? []).find((u) => u.email?.toLowerCase() === OWNER_EMAIL);
if (!owner) {
  console.error(`Owner ${OWNER_EMAIL} not found.`);
  process.exit(1);
}
console.log("Seeding brands for owner:", owner.id, "\n");

for (const b of BRANDS) {
  const { data: existing } = await admin
    .from("brands")
    .select("id")
    .eq("owner_user_id", owner.id)
    .eq("name", b.name)
    .maybeSingle();
  if (existing) {
    console.log(`• "${b.name}" already exists — skipping.`);
    continue;
  }

  const slug = slugify(b.name);
  const { data: brand, error: bErr } = await admin
    .from("brands")
    .insert({ name: b.name, slug, owner_user_id: owner.id, status: "active" })
    .select()
    .single();
  if (bErr || !brand) {
    console.error(`Failed to create "${b.name}":`, bErr?.message);
    continue;
  }

  let attached = 0;
  for (const restName of b.attach) {
    const { data: rest } = await admin
      .from("restaurants")
      .select("id, brand_id")
      .eq("owner_user_id", owner.id)
      .eq("name", restName)
      .maybeSingle();
    if (!rest) {
      console.warn(`  ! restaurant "${restName}" not found`);
      continue;
    }
    if (rest.brand_id && rest.brand_id !== brand.id) {
      console.warn(`  ! "${restName}" already in another brand — leaving it`);
      continue;
    }
    await admin.from("restaurants").update({ brand_id: brand.id }).eq("id", rest.id);
    attached++;
  }

  console.log(`✓ ${b.name}  (/brands/${slug})  —  ${attached} restaurant(s) attached`);
}

console.log("\nDone. Refresh your dashboard — 'Brands you own' should now show 2.");
