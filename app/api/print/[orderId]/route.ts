import { NextResponse } from "next/server";
import { isUuid } from "@/lib/utils";
import { getCurrentUser, getRoleInRestaurant } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatSelectedOptionLabel } from "@/lib/customizations";
import {
  buildEscPosKotBytes,
  buildEscPosReceiptBytes,
} from "@/lib/escpos";
import { resolveEffectiveStationId } from "@/lib/kot-routing";
import { formatOrderTenderLabel } from "@/lib/register";
import { resolveTimeZone } from "@/lib/time";
import type { Order, OrderItem, OrderPayment, Outlet, ProductConfig } from "@/lib/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const id = (await params).orderId;
  if (!isUuid(id)) {
    return new NextResponse("Invalid order id", { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return new NextResponse("Sign in to print", { status: 401 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!order) return new NextResponse("Not found", { status: 404 });

  const { data: outlet } = await admin
    .from("outlets")
    .select("*")
    .eq("id", order.outlet_id)
    .maybeSingle();

  const role = outlet ? await getRoleInRestaurant(outlet.restaurant_id) : null;
  if (!role) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "kot" ? "kot" : "receipt";
  const paperWidth: 58 | 80 = url.searchParams.get("width") === "58" ? 58 : 80;
  const stationFilter = url.searchParams.get("station")?.trim() || null;
  const stationIdFilter = url.searchParams.get("station_id")?.trim() || null;
  const forceKick = url.searchParams.get("kick") === "1";

  const [{ data: items }, { data: paymentsData }, { data: stationsData }, { data: categoriesData }, { data: productsData }] =
    await Promise.all([
      admin.from("order_items").select("*").eq("order_id", id).order("id"),
      admin.from("order_payments").select("*").eq("order_id", id),
      admin
        .from("kitchen_stations")
        .select("id, name")
        .eq("outlet_id", order.outlet_id),
      admin
        .from("categories")
        .select("name, station_id")
        .eq("outlet_id", order.outlet_id),
      admin
        .from("products")
        .select("id, category, station_id, is_kot_required")
        .eq("outlet_id", order.outlet_id),
    ]);

  const o = order as Order;
  const out = (outlet ?? null) as Outlet | null;
  const its = (items ?? []) as OrderItem[];
  const payments = (paymentsData ?? []) as OrderPayment[];
  const tenderText = formatOrderTenderLabel(o, payments);

  const placedAt = o.placed_at ?? o.created_at;
  const placedStr = placedAt
    ? new Date(placedAt).toLocaleString("en-IN", {
        timeZone: resolveTimeZone(out?.timezone),
      })
    : "";

  let bytes: Uint8Array;
  let filename = `receipt-${o.id}.bin`;

  if (mode === "kot") {
    const stationNameById = new Map(
      (stationsData ?? []).map((s) => [s.id, s.name]),
    );
    const catStationMap = new Map(
      (categoriesData ?? []).map((c) => [
        c.name.trim().toLowerCase(),
        c.station_id ?? null,
      ]),
    );
    const prodMap = new Map((productsData ?? []).map((p) => [p.id, p]));

    const kotItems = its
      .filter((line) => {
        const cfg = line.product_config as unknown as ProductConfig | null;
        const pid = cfg?.product_id;
        const prod = pid ? prodMap.get(pid) : undefined;
        if (prod && prod.is_kot_required === false) return false;
        if (!stationIdFilter && !stationFilter) return true;
        const stId = resolveEffectiveStationId(prod, catStationMap);
        if (stationIdFilter) return stId === stationIdFilter;
        const stName = stId ? stationNameById.get(stId) ?? "" : "";
        return stName.toLowerCase() === (stationFilter ?? "").toLowerCase();
      })
      .map((line) => {
        const cfg = line.product_config as unknown as ProductConfig | null;
        return {
          name: cfg?.name ?? "Item",
          quantity: line.quantity,
          modifiers: (cfg?.selected_options ?? []).map((m) =>
            formatSelectedOptionLabel(m),
          ),
          instructions: line.instructions,
        };
      });

    const resolvedStationTitle = stationIdFilter
      ? stationNameById.get(stationIdFilter) ?? stationFilter
      : stationFilter;

    bytes = buildEscPosKotBytes({
      outletName: out?.name ?? "OUTLET",
      stationName: resolvedStationTitle,
      billNumber: o.unique_order_id ?? `#${o.id.slice(0, 8)}`,
      tokenNumber: o.token_number,
      tableLabel: o.customer_name && o.customer_name !== "Walk-in" ? o.customer_name : null,
      orderType: o.order_type ?? "dine-in",
      placedAtLabel: placedStr,
      orderNote: o.instructions,
      items: kotItems,
      paperWidth,
    });
    filename = `kot-${o.id}.bin`;
  } else {
    const hasCashPayment =
      payments.some((p) => p.payment_mode === "cash") ||
      o.payment_mode === "cash";
    let kickDrawer = forceKick;
    if (!kickDrawer && hasCashPayment) {
      const { data: kickPrinter } = await admin
        .from("printers")
        .select("id")
        .eq("outlet_id", order.outlet_id)
        .eq("status", "active")
        .eq("kick_cash_drawer", true)
        .limit(1)
        .maybeSingle();
      kickDrawer = Boolean(kickPrinter);
    }

    bytes = buildEscPosReceiptBytes({
      outletName: out?.name ?? "OUTLET",
      address: out?.address,
      gstin: out?.gstin,
      fssai: out?.fssai_license,
      phone: out?.phone,
      billNumber: o.unique_order_id ?? `#${o.id.slice(0, 8)}`,
      source: o.source ?? "pos",
      tokenNumber: o.token_number,
      placedAtLabel: placedStr,
      orderType: o.order_type ?? "dine-in",
      customerName: o.customer_name,
      tenderLabel: tenderText,
      items: its.map((line) => {
        const cfg = line.product_config as unknown as ProductConfig | null;
        return {
          name: cfg?.name ?? "Item",
          quantity: line.quantity,
          totalPrice: Number(line.total_price),
          modifiers: (cfg?.selected_options ?? []).map((m) =>
            formatSelectedOptionLabel(m),
          ),
          instructions: line.instructions,
        };
      }),
      orderNote: o.instructions,
      subtotal: Number(o.subtotal ?? 0),
      cgst: Number(o.cgst_amount ?? 0),
      sgst: Number(o.sgst_amount ?? 0),
      packingCharge: Number(o.takeaway_charges ?? 0),
      discountAmount: Number(o.discount_amount ?? 0),
      loyaltyPointsRedeemed: Number(o.loyalty_points_redeemed ?? 0),
      loyaltyDiscountAmount: Number(o.loyalty_discount_amount ?? 0),
      loyaltyPointsEarned: Number(o.loyalty_points_earned ?? 0),
      roundingAmount: Number(o.rounding_amount ?? 0),
      totalAmount: Number(o.total_amount),
      paperWidth,
      kickDrawer,
    });
  }

  return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Print-Width-Mm": String(paperWidth),
    },
  });
}
