import { NextResponse } from "next/server";
import { apiCorsHeaders, preflightCorsHeaders } from "@/lib/api-cors";
import { authenticateApiKey } from "@/lib/api-keys";
import { formatCouponOfferLabel } from "@/lib/coupons";
import { isOutletOpen } from "@/lib/opening-hours";
import { getPublicPaymentConfig } from "@/lib/payments";
import {
  checkRateLimit,
  clientIpFromRequest,
  rateLimitHeaders,
} from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/menu — the restaurant, its outlets and one outlet's live menu, for
// frontends that hold a restaurant API key with the "Read menu" permission.
//
// ?outlet_id=<uuid> picks the outlet; without it, the key's outlet (if the key
// is limited to one) or the restaurant's first active outlet is used. Only
// active categories, products, add-on groups and options are returned — the
// same things the POS and the Billjot storefront offer.

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const headers = await preflightCorsHeaders(request, "GET, OPTIONS");
  return new NextResponse(null, { status: 204, headers });
}

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const ip = clientIpFromRequest(request);
  let headers = apiCorsHeaders(origin, "GET, OPTIONS", null, request.url);

  const ipLimit = await checkRateLimit({
    bucket: `menu:ip:${ip}`,
    limit: 180,
    windowSeconds: 60,
  });
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { ...headers, ...rateLimitHeaders(ipLimit) } },
    );
  }

  const check = await authenticateApiKey(request, "menu:read");
  if (!check.ok) {
    return NextResponse.json(
      { error: check.error },
      { status: check.status, headers: { ...headers, ...rateLimitHeaders(ipLimit) } },
    );
  }
  const key = check.key;
  headers = apiCorsHeaders(origin, "GET, OPTIONS", key.allowedOrigins, request.url);

  const keyLimit = await checkRateLimit({
    bucket: `menu:key:${key.id}`,
    limit: 120,
    windowSeconds: 60,
  });
  headers = { ...headers, ...rateLimitHeaders(keyLimit) };
  if (!keyLimit.allowed) {
    return NextResponse.json(
      { error: "Too many menu requests for this API key. Slow down and retry." },
      { status: 429, headers },
    );
  }

  const fail = (status: number, error: string) =>
    NextResponse.json({ error }, { status, headers });

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

  const outlets = (outletsRes.data ?? [])
    .filter((o) => key.outletId === null || o.id === key.outletId)
    .map((o) => ({
      ...o,
      is_open: isOutletOpen(o.opening_hours, o.timezone).open,
    }));
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
    payment_methods: null,
    categories: [],
    products: [],
    modifier_groups: [],
    coupons: [],
  };
  if (!outlet) return NextResponse.json(empty, { headers });

  const [categoriesRes, productsRes, payCfg, couponsRes] = await Promise.all([
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
    getPublicPaymentConfig(outlet.id),
    supabase
      .from("coupons")
      .select(
        "code, title, discount_type, discount_value, max_discount, min_order_amount, channel, usage_limit, used_count, expires_at",
      )
      .eq("restaurant_id", key.restaurantId)
      .eq("is_active", true)
      .in("channel", ["all", "storefront", "dine_in"])
      .order("min_order_amount", { ascending: true }),
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
        .select("product_id, group_id, sort_order, is_required_override")
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
          .select(
            "id, display_name, selection_type, is_required, min_selections, max_selections, free_selections, sort_order",
          )
          .in("id", groupIds)
          .eq("status", "active")
          .order("sort_order", { ascending: true }),
        supabase
          .from("customization_options")
          .select(
            "id, group_id, name, price, veg_status, is_default, max_qty, variant_prices, sort_order",
          )
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
  const overridesByProduct = new Map<string, Record<string, boolean>>();
  for (const l of links) {
    if (!activeGroups.has(l.group_id)) continue;
    const list = groupsByProduct.get(l.product_id) ?? [];
    list.push(l.group_id);
    groupsByProduct.set(l.product_id, list);
    if (typeof l.is_required_override === "boolean") {
      const ov = overridesByProduct.get(l.product_id) ?? {};
      ov[l.group_id] = l.is_required_override;
      overridesByProduct.set(l.product_id, ov);
    }
  }

  const nowMs = Date.now();
  const publicCoupons = (couponsRes.data ?? [])
    .filter((c) => {
      if (c.expires_at && new Date(c.expires_at).getTime() <= nowMs) return false;
      if (c.usage_limit && c.used_count >= c.usage_limit) return false;
      return true;
    })
    .map((c) => ({
      code: c.code,
      title: c.title,
      discount_type: c.discount_type,
      discount_value: Number(c.discount_value),
      max_discount: c.max_discount != null ? Number(c.max_discount) : null,
      min_order_amount: Number(c.min_order_amount ?? 0),
      label: formatCouponOfferLabel(c),
    }));

  return NextResponse.json(
    {
      restaurant: restaurantRes.data,
      outlets,
      outlet_id: outlet.id,
      payment_methods: {
        cod_enabled: payCfg.codEnabled,
        online_enabled: payCfg.onlineEnabled,
        razorpay: {
          enabled: payCfg.razorpayEnabled && Boolean(payCfg.razorpayKeyId),
          key_id: payCfg.razorpayKeyId,
        },
        stripe: {
          enabled: payCfg.stripeEnabled,
          publishable_key: payCfg.stripePublishableKey,
        },
        upi_vpa: payCfg.upiVpa,
      },
      categories: categoriesRes.data ?? [],
      products: products.map((p) => {
        const overrides = overridesByProduct.get(p.id);
        return {
          ...p,
          price: Number(p.price ?? 0),
          modifier_group_ids: groupsByProduct.get(p.id) ?? [],
          ...(overrides ? { modifier_group_overrides: overrides } : {}),
        };
      }),
      modifier_groups: (groupsRes.data ?? []).map((g) => ({
        id: g.id,
        name: g.display_name,
        selection: g.selection_type === "multi" ? "multiple" : "single",
        required: Boolean(g.is_required),
        min_selections: g.min_selections ?? 0,
        max_selections: g.max_selections ?? null,
        free_selections: g.free_selections ?? 0,
        options: (optionsRes.data ?? [])
          .filter((o) => o.group_id === g.id)
          .map((o) => ({
            id: o.id,
            name: o.name,
            price: Number(o.price),
            veg_status: o.veg_status ?? "Veg",
            is_default: Boolean(o.is_default),
            max_qty: o.max_qty ?? 1,
            variant_prices: o.variant_prices ?? {},
          })),
      })),
      coupons: publicCoupons,
    },
    { headers: { ...headers, "Cache-Control": "private, max-age=30" } },
  );
}
