import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderSource } from "@/lib/types";
import type { Json } from "@/lib/database.types";

// Order creation runs with the service-role admin client (bypasses RLS).
// This is intentional: the storefront accepts orders from anonymous customers
// (no sign-in required), and the POS posts from authenticated cashiers — but
// both go through this endpoint. Auth/role-based access control lives at the
// route level (POS layout's requireRole); this handler trusts its payload
// and validates it server-side.
//
// IMPORTANT: never expose this route to user-controlled outlet_id without
// validating it belongs to the requesting context. Today's clients (kiosk,
// POS) hardcode it from env / session, but if we ever surface outlet pick to
// a public form, add a validation step.

type OrderItemInput = {
  product_config: Json;
  quantity: number;
  unit_price: number;
  total_price: number;
};

type OrderBody = {
  customer_name: string;
  customer_email: string;
  order_type: string;
  subtotal: number;
  takeaway_charges: number;
  total_amount: number;
  items: OrderItemInput[];
  // Optional — present for kiosk/pos clients and aggregator webhooks.
  source?: OrderSource;
  outlet_id?: number;
  external_order_id?: string;
  external_payload?: Json;
};

const FALLBACK_OUTLET_ID = Number(
  process.env.NEXT_PUBLIC_DEFAULT_OUTLET_ID ?? "1",
);

// Shared secret for external storefront clients (the standalone per-tenant
// storefronts that forward orders here). Authenticates that channel without
// breaking same-origin browser callers (POS / first-party checkout), which
// send no token: we only enforce a match when an `x-storefront-token` header
// is actually present. To later require it for ALL public web orders, gate the
// anon order path on this too.
const STOREFRONT_ORDER_TOKEN = process.env.STOREFRONT_ORDER_TOKEN;

// ---------------------------------------------------------------------------
// CORS. Standalone per-tenant storefronts post here from a DIFFERENT origin,
// so the browser sends a preflight OPTIONS and expects Access-Control-* headers.
// Same-origin callers (POS / first-party checkout) are unaffected.
//
// Allowed origins come from STOREFRONT_ALLOWED_ORIGINS (comma-separated). If
// unset, we reflect the caller's origin (convenient for local dev / demos).
// Set it in production to lock down which storefronts may post.
// ---------------------------------------------------------------------------
function resolveAllowedOrigin(origin: string | null): string | null {
  const raw = process.env.STOREFRONT_ALLOWED_ORIGINS?.trim();
  if (!raw || raw === "*") return origin ?? "*";
  const allow = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return origin && allow.includes(origin) ? origin : null;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-storefront-token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  const allowed = resolveAllowedOrigin(origin);
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

// ---------------------------------------------------------------------------
// Server-side pricing. NEVER trust client-supplied prices/totals for first-party
// orders (POS / web / kiosk): a tampered client could post total_amount = 1.
// We recompute every line from the products catalog (scoped to the outlet) and
// validate modifier options against customization_options, then derive
// GST-inclusive tax. Aggregator/external orders keep their platform's totals.
// ---------------------------------------------------------------------------
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

type ConfigShape = {
  product_id?: number;
  name?: string;
  selected_options?: Array<{
    group_id?: number;
    group_name?: string;
    option_id?: number;
    option_name?: string;
    price?: number;
  }>;
};

type Totals = {
  items: Array<{
    product_config: Json;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  subtotal: number;
  cgst: number;
  sgst: number;
  takeaway_charges: number;
  total_amount: number;
};

// GST-inclusive helper: the rate is baked into the price (typical Indian QSR).
function splitGst(lineTotal: number, ratePct: number) {
  const rate = (Number(ratePct) || 0) / 100;
  return lineTotal - lineTotal / (1 + rate);
}

async function recomputeFirstParty(
  supabase: ReturnType<typeof createAdminClient>,
  outletId: number,
  items: OrderItemInput[],
  takeawayCharges: number,
): Promise<{ ok: true; totals: Totals } | { ok: false; error: string }> {
  const configs = items.map((it) => (it.product_config ?? {}) as ConfigShape);
  const productIds = [
    ...new Set(configs.map((c) => c.product_id).filter((x): x is number => !!x)),
  ];
  if (productIds.length === 0) return { ok: false, error: "No valid products" };

  // Only this outlet's active products — prevents cross-outlet price spoofing.
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, gst_rate, hsn_code, status")
    .eq("outlet_id", outletId)
    .in("id", productIds);
  const prodById = new Map((products ?? []).map((p) => [p.id, p]));

  const optionIds = [
    ...new Set(
      configs.flatMap((c) =>
        (c.selected_options ?? [])
          .map((o) => o.option_id)
          .filter((x): x is number => !!x),
      ),
    ),
  ];
  const optById = new Map<number, { id: number; name: string; price: number }>();
  if (optionIds.length > 0) {
    const { data: opts } = await supabase
      .from("customization_options")
      .select("id, name, price")
      .in("id", optionIds);
    for (const o of opts ?? []) optById.set(o.id, o);
  }

  let runningTotal = 0;
  let runningGst = 0;
  const outItems: Totals["items"] = [];

  for (let i = 0; i < items.length; i++) {
    const cfg = configs[i];
    const product = cfg.product_id ? prodById.get(cfg.product_id) : undefined;
    if (!product || product.status !== "active") {
      return {
        ok: false,
        error: `"${cfg.name ?? cfg.product_id}" is unavailable at this outlet`,
      };
    }
    const qty = Math.max(1, Math.floor(Number(items[i].quantity) || 0));

    let optionSum = 0;
    const cleanOptions = [];
    for (const sel of cfg.selected_options ?? []) {
      const opt = sel.option_id ? optById.get(sel.option_id) : undefined;
      if (!opt) {
        return { ok: false, error: `Invalid option on "${product.name}"` };
      }
      optionSum += Number(opt.price) || 0;
      cleanOptions.push({
        group_id: sel.group_id,
        group_name: sel.group_name,
        option_id: opt.id,
        option_name: opt.name,
        price: Number(opt.price) || 0,
      });
    }

    const base = Number(product.price) || 0;
    const unit = base + optionSum;
    const lineTotal = unit * qty;
    runningTotal += lineTotal;
    runningGst += splitGst(lineTotal, Number(product.gst_rate ?? 5));

    outItems.push({
      quantity: qty,
      unit_price: round2(unit),
      total_price: round2(lineTotal),
      product_config: {
        product_id: product.id,
        name: product.name,
        base_price: base,
        gst_rate: Number(product.gst_rate ?? 5),
        hsn_code: product.hsn_code ?? null,
        selected_options: cleanOptions,
      } as Json,
    });
  }

  const packing = Math.max(0, Number(takeawayCharges) || 0);
  return {
    ok: true,
    totals: {
      items: outItems,
      subtotal: round2(runningTotal - runningGst),
      cgst: round2(runningGst / 2),
      sgst: round2(runningGst / 2),
      takeaway_charges: packing,
      total_amount: round2(runningTotal + packing),
    },
  };
}

// Aggregator/external path: trust the platform's prices/totals (their menu may
// be marked up), but still derive GST from the line totals so invoices aren't ₹0.
function trustExternal(body: OrderBody): Totals {
  let gst = 0;
  const items = body.items.map((it) => {
    const cfg = (it.product_config ?? {}) as ConfigShape & { gst_rate?: number };
    gst += splitGst(Number(it.total_price) || 0, Number(cfg.gst_rate ?? 5));
    return {
      product_config: it.product_config,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total_price: it.total_price,
    };
  });
  return {
    items,
    subtotal: round2(Number(body.subtotal) || 0),
    cgst: round2(gst / 2),
    sgst: round2(gst / 2),
    takeaway_charges: Math.max(0, Number(body.takeaway_charges) || 0),
    total_amount: round2(Number(body.total_amount) || 0),
  };
}

export async function POST(request: Request) {
  const cors = corsHeaders(request.headers.get("origin"));
  const presentedToken = request.headers.get("x-storefront-token");
  if (presentedToken !== null) {
    if (!STOREFRONT_ORDER_TOKEN || presentedToken !== STOREFRONT_ORDER_TOKEN) {
      return NextResponse.json(
        { error: "Invalid storefront token" },
        { status: 401, headers: cors },
      );
    }
  }

  const body = (await request.json()) as OrderBody;

  if (!body.customer_name || !body.customer_email || !body.items?.length) {
    return NextResponse.json(
      { error: "Missing customer or items" },
      { status: 400, headers: cors },
    );
  }

  const supabase = createAdminClient();
  const outletId = body.outlet_id ?? FALLBACK_OUTLET_ID;
  const source: OrderSource = body.source ?? "web";

  // Validate the outlet exists and is active. Required now that the public
  // storefront posts a user-resolved outlet_id (see header note): never insert
  // an order against an unknown/inactive outlet.
  const { data: outletRow } = await supabase
    .from("outlets")
    .select("id, status")
    .eq("id", outletId)
    .maybeSingle();
  if (!outletRow || outletRow.status !== "active") {
    return NextResponse.json(
      { error: "Unknown or inactive outlet" },
      { status: 400, headers: cors },
    );
  }

  // Idempotency for aggregator webhooks: if this (outlet, source, external_order_id)
  // already landed, return the existing order rather than inserting a duplicate.
  if (body.external_order_id) {
    const { data: existing } = await supabase
      .from("orders")
      .select("*")
      .eq("outlet_id", outletId)
      .eq("source", source)
      .eq("external_order_id", body.external_order_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { order: existing, deduped: true },
        { headers: cors },
      );
    }
  }

  // Recompute first-party orders from the catalog; trust aggregator totals.
  const firstParty =
    !body.external_order_id &&
    (source === "pos" || source === "web" || source === "kiosk");

  let totals: Totals;
  if (firstParty) {
    const result = await recomputeFirstParty(
      supabase,
      outletId,
      body.items,
      body.takeaway_charges,
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: cors },
      );
    }
    totals = result.totals;
  } else {
    totals = trustExternal(body);
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      outlet_id: outletId,
      source,
      customer_name: body.customer_name,
      customer_email: body.customer_email,
      order_type: body.order_type,
      subtotal: totals.subtotal,
      cgst_amount: totals.cgst,
      sgst_amount: totals.sgst,
      takeaway_charges: totals.takeaway_charges,
      total_amount: totals.total_amount,
      status: "pending",
      unique_order_id: `BJ-${Date.now()}`,
      external_order_id: body.external_order_id ?? null,
      external_payload: body.external_payload ?? null,
    })
    .select()
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: orderErr?.message ?? "Failed to create order" },
      { status: 500, headers: cors },
    );
  }

  const { error: itemsErr } = await supabase.from("order_items").insert(
    totals.items.map((it) => ({
      order_id: order.id,
      product_config: it.product_config,
      quantity: it.quantity,
      unit_price: it.unit_price,
      total_price: it.total_price,
    })),
  );

  if (itemsErr) {
    return NextResponse.json(
      { error: itemsErr.message },
      { status: 500, headers: cors },
    );
  }

  return NextResponse.json({ order }, { headers: cors });
}
