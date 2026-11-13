import { NextResponse } from "next/server";
import { apiCorsHeaders } from "@/lib/api-cors";
import { authenticateApiKey } from "@/lib/api-keys";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/menu — the restaurant, its outlets and one outlet's live menu, for
// frontends that hold a restaurant API key with the "Read menu" permission.
//
// ?outlet_id=<uuid> picks the outlet; without it, the key's outlet (if the key
// is limited to one) or the restaurant's first active outlet is used. Only
// active categories, products, add-on groups and options are returned — the
// same things the POS and the Billjot storefront offer.

export const dynamic = "force-dynamic";

function cors(request: Request) {
  return apiCorsHeaders(request.headers.get("origin"), "GET, OPTIONS");
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: cors(request) });
}

export async function GET(request: Request) {
  const headers = cors(request);
  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers });

  const check = await authenticateApiKey(request, "menu:read");
  if (!check.ok) return fail(check.status, check.error);
  const key = check.key;

  const supabase = createAdminClient();
  const [restaurantRes, outletsRes] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id, name, slug")
      .eq("id", key.restaurantId)
      .maybeSingle(),
    supabase
      .from("outlets")
      .select(
        "id, name, address, city, state, pincode, phone, currency, timezone, opening_hours",
      )
      .eq("restaurant_id", key.restaurantId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
  ]);
  if (restaurantRes.error || outletsRes.error) {
    return fail(500, "Couldn't read the menu. Try again.");
  }
  if (!restaurantRes.data) return fail(404, "Restaurant not found");

  const outlets = (outletsRes.data ?? []).filter(
    (o) => key.outletId === null || o.id === key.outletId,
  );
  const requested = new URL(request.url).searchParams.get("outlet_id");
  const outlet = requested
    ? outlets.find((o) => o.id === requested)
    : outlets[0];
  if (requested && !outlet) {
    return fail(404, "Unknown outlet, or this API key doesn't cover it");
  }

  const empty = {
    restaurant: restaurantRes.data,
    outlets,
    outlet_id: null,
    categories: [],
    products: [],
    modifier_groups: [],
  };
  if (!outlet) return NextResponse.json(empty, { headers });

  const [categoriesRes, productsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, emoji, sort_order")
      .eq("outlet_id", outlet.id)
      .eq("status", "active")
      .order("sort_order", { ascending: true }),
    supabase
      .from("products")
      .select(
        "id, name, description, category, price, gst_rate, veg_status, image_url, code",
      )
      .eq("outlet_id", outlet.id)
      .eq("status", "active")
      .order("category", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  if (categoriesRes.error || productsRes.error) {
    return fail(500, "Couldn't read the menu. Try again.");
  }
  const products = productsRes.data ?? [];

  // Add-on groups linked to these products, with their active options.
  const productIds = products.map((p) => p.id);
  const linksRes = productIds.length
    ? await supabase
        .from("product_customizations")
        .select("product_id, group_id, sort_order")
        .in("product_id", productIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (linksRes.error) return fail(500, "Couldn't read the menu. Try again.");
  const links = linksRes.data ?? [];

  const groupIds = [...new Set(links.map((l) => l.group_id))];
  const [groupsRes, optionsRes] = groupIds.length
    ? await Promise.all([
        supabase
          .from("customization_groups")
          .select("id, display_name, selection_type, is_required, sort_order")
          .in("id", groupIds)
          .eq("status", "active")
          .order("sort_order", { ascending: true }),
        supabase
          .from("customization_options")
          .select("id, group_id, name, price, sort_order")
          .in("group_id", groupIds)
          .eq("status", "active")
          .order("sort_order", { ascending: true }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (groupsRes.error || optionsRes.error) {
    return fail(500, "Couldn't read the menu. Try again.");
  }

  const activeGroups = new Set((groupsRes.data ?? []).map((g) => g.id));
  const groupsByProduct = new Map<string, string[]>();
  for (const l of links) {
    if (!activeGroups.has(l.group_id)) continue;
    const list = groupsByProduct.get(l.product_id) ?? [];
    list.push(l.group_id);
    groupsByProduct.set(l.product_id, list);
  }

  return NextResponse.json(
    {
      restaurant: restaurantRes.data,
      outlets,
      outlet_id: outlet.id,
      categories: categoriesRes.data ?? [],
      products: products.map((p) => ({
        ...p,
        price: Number(p.price ?? 0),
        modifier_group_ids: groupsByProduct.get(p.id) ?? [],
      })),
      modifier_groups: (groupsRes.data ?? []).map((g) => ({
        id: g.id,
        name: g.display_name,
        selection: g.selection_type === "multi" ? "multiple" : "single",
        required: Boolean(g.is_required),
        options: (optionsRes.data ?? [])
          .filter((o) => o.group_id === g.id)
          .map((o) => ({ id: o.id, name: o.name, price: Number(o.price) })),
      })),
    },
    { headers: { ...headers, "Cache-Control": "private, max-age=30" } },
  );
}
