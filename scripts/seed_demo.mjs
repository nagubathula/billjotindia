import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import crypto from "crypto";

// Load root env
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE URL or KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Seeding dummy data...");

  // Insert brand
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .insert({ name: "Demo Brand", slug: crypto.randomUUID() })
    .select()
    .single();

  if (brandErr) throw brandErr;
  console.log("Brand:", brand.id);

  // Insert restaurant
  const { data: rest, error: restErr } = await supabase
    .from("restaurants")
    .insert({
      brand_id: brand.id,
      name: "Demo Restaurant",
      slug: crypto.randomUUID(), // UUID slug since we wanted unique strings
    })
    .select()
    .single();

  if (restErr) throw restErr;
  console.log("Restaurant:", rest.id);

  // Insert outlet
  const { data: outlet, error: outletErr } = await supabase
    .from("outlets")
    .insert({
      restaurant_id: rest.id,
      name: "Main Outlet",
      slug: crypto.randomUUID(),
    })
    .select()
    .single();

  if (outletErr) throw outletErr;
  console.log("Outlet:", outlet.id);

  // Insert category
  const { data: category, error: catErr } = await supabase
    .from("categories")
    .insert({
      outlet_id: outlet.id,
      name: "Pizzas",
      sort_order: 1,
    })
    .select()
    .single();

  if (catErr) throw catErr;

  // Insert product
  await supabase
    .from("products")
    .insert({
      outlet_id: outlet.id,
      category_id: category.id,
      name: "Margherita Pizza",
      price: 15.99,
      type: "prepared",
    });

  // Update .env.local in root
  const envPathRoot = ".env.local";
  let envRoot = fs.readFileSync(envPathRoot, "utf-8");
  envRoot = envRoot.replace(
    /NEXT_PUBLIC_DEFAULT_OUTLET_ID=.*/,
    `NEXT_PUBLIC_DEFAULT_OUTLET_ID=${outlet.id}`
  );
  fs.writeFileSync(envPathRoot, envRoot);

  // Update .env.local in storefront-template
  const envPathStore = "templates/storefront-template/.env.local";
  let envStore = fs.readFileSync(envPathStore, "utf-8");
  envStore = envStore.replace(
    /NEXT_PUBLIC_RESTAURANT_ID=.*/,
    `NEXT_PUBLIC_RESTAURANT_ID="${rest.id}"`
  );
  envStore = envStore.replace(
    /OUTLET_ID=.*/,
    `OUTLET_ID="${outlet.id}"`
  );
  fs.writeFileSync(envPathStore, envStore);

  console.log("Data seeded and environment variables updated!");
}

run().catch(console.error);
