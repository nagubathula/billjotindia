import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run with: node --env-file=.env.local scripts/clear-all.mjs");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function clearData() {
  console.log("Starting to clear all tables data...");
  const tablesToClear = [
    "kot_ticket_items",
    "kot_tickets",
    "printers",
    "kitchen_stations",
    "order_items",
    "orders",
    "product_customizations",
    "customization_options",
    "customization_groups",
    "products",
    "categories",
    "user_roles",
    "outlets",
    "restaurants",
    "brands",
    "profiles"
  ];

  for (const table of tablesToClear) {
    console.log(`Clearing ${table}...`);
    // we use a dummy condition to delete everything because delete() without filters errors
    const { data, error } = await admin.from(table).delete().not("id", "is", null);
    if (error) {
      console.error(`Failed to clear ${table}:`, error.message);
    } else {
      console.log(`Cleared ${table}`);
    }
  }
  
  // also delete auth users
  console.log("Clearing auth users...");
  let { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) {
    console.error("Failed to list users:", usersError.message);
  } else if (usersData && usersData.users) {
    for (const user of usersData.users) {
      const { error: delError } = await admin.auth.admin.deleteUser(user.id);
      if (delError) {
        console.error(`Failed to delete user ${user.id}:`, delError.message);
      }
    }
    console.log(`Cleared ${usersData.users.length} users`);
  }

  console.log("All tables data cleared.");
}

clearData();
