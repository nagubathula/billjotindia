import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/attach-brand.mjs");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function run() {
  const { data: brand } = await admin.from("brands").select("id, name").eq("name", "Daybreak Hospitality").maybeSingle();
  if (!brand) {
    console.error("Daybreak Hospitality brand not found.");
    return;
  }

  const { data: restaurants, error } = await admin
    .from("restaurants")
    .update({ brand_id: brand.id })
    .is("brand_id", null)
    .select("name");

  if (error) {
    console.error("Error attaching restaurants:", error.message);
  } else {
    console.log(`Attached ${restaurants.length} restaurants to "${brand.name}":`);
    restaurants.forEach((r) => console.log(` - ${r.name}`));
  }
}

run();
