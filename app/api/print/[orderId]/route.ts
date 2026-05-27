// ESC/POS print stub for thermal printers.
//
// Generates raw ESC/POS bytes for an order's receipt. Today this is only
// useful for download / inspection — production setups should either:
//   (a) Run a small local "print agent" on the POS terminal that polls this
//       endpoint (or listens to a queue) and forwards bytes to the
//       USB/Bluetooth/network printer attached to the counter.
//   (b) Use a cloud-printer service (Star CloudPRNT, Epson Connect) that
//       pulls jobs from a queue. We'd push the byte stream into a job and
//       the cloud printer fetches it.
//   (c) Use Web USB/Bluetooth from the browser if the POS device supports it
//       (Chrome desktop / Android). The browser code calls this endpoint
//       and writes the bytes to the printer endpoint directly.
//
// This v0 returns the bytes as `application/octet-stream` so any of the
// above can wire to it without further server changes.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Order, OrderItem, Outlet, ProductConfig } from "@/lib/types";

// ESC/POS control codes. https://reference.epson-biz.com/modules/ref_escpos/
const ESC = 0x1b;
const GS = 0x1d;

function bytes(...parts: Array<number | number[] | string>): Buffer {
  const arr: number[] = [];
  for (const p of parts) {
    if (typeof p === "number") arr.push(p);
    else if (typeof p === "string") {
      for (let i = 0; i < p.length; i++) arr.push(p.charCodeAt(i) & 0xff);
    } else arr.push(...p);
  }
  return Buffer.from(arr);
}

const INIT = [ESC, 0x40]; // ESC @
const CUT = [GS, 0x56, 0x00]; // GS V 0 (full cut)
const ALIGN_LEFT = [ESC, 0x61, 0x00];
const ALIGN_CENTER = [ESC, 0x61, 0x01];
const BOLD_ON = [ESC, 0x45, 0x01];
const BOLD_OFF = [ESC, 0x45, 0x00];
const SIZE_DOUBLE = [GS, 0x21, 0x11]; // double width + height
const SIZE_NORMAL = [GS, 0x21, 0x00];
const LF = "\n";
const FEED_3 = "\n\n\n";

/** 80mm thermal paper at standard font fits 32 chars per line. */
const WIDTH = 32;

function padLine(left: string, right: string): string {
  const cap = WIDTH;
  const space = Math.max(1, cap - left.length - right.length);
  return left + " ".repeat(space) + right;
}

function divider(char = "-"): string {
  return char.repeat(WIDTH) + LF;
}

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } },
) {
  const id = Number(params.orderId);
  if (!Number.isFinite(id)) {
    return new NextResponse("Invalid order id", { status: 400 });
  }

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

  const { data: items } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", id);

  const o = order as Order;
  const out = (outlet ?? null) as Outlet | null;
  const its = (items ?? []) as OrderItem[];

  const placedAt = o.placed_at ?? o.created_at;
  const placedStr = placedAt ? new Date(placedAt).toLocaleString("en-IN") : "";

  // Build the receipt as text + control bytes
  const buf: Array<number | number[] | string> = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    SIZE_DOUBLE,
    (out?.name ?? "OUTLET") + LF,
    SIZE_NORMAL,
    BOLD_OFF,
  ];
  if (out?.address) buf.push(out.address + LF);
  if (out?.gstin) buf.push("GSTIN: " + out.gstin + LF);
  if (out?.phone) buf.push("Ph: " + out.phone + LF);
  buf.push(divider("="));
  buf.push(ALIGN_LEFT);
  buf.push(`Bill: ${o.unique_order_id ?? "#" + o.id}` + LF);
  buf.push(`Source: ${(o.source ?? "").toUpperCase()}` + LF);
  if (o.token_number != null) {
    buf.push(ALIGN_CENTER, BOLD_ON, SIZE_DOUBLE);
    buf.push(`TOKEN ${o.token_number}` + LF);
    buf.push(SIZE_NORMAL, BOLD_OFF, ALIGN_LEFT);
  }
  buf.push(placedStr + LF);
  buf.push(`Type: ${o.order_type}` + LF);
  buf.push(divider());

  // Items
  buf.push(BOLD_ON, padLine("Item", "Qty   Rs") + LF, BOLD_OFF);
  buf.push(divider());
  for (const line of its) {
    const cfg = line.product_config as unknown as ProductConfig | null;
    const name = (cfg?.name ?? "Item").slice(0, 18);
    const qty = String(line.quantity);
    const total = Number(line.total_price).toFixed(0);
    buf.push(padLine(name, `${qty.padStart(3)}  ${total.padStart(5)}`) + LF);
  }
  buf.push(divider());

  // Totals
  buf.push(padLine("Subtotal", "Rs " + Number(o.subtotal ?? 0).toFixed(0)) + LF);
  if (Number(o.cgst_amount ?? 0) > 0)
    buf.push(padLine("CGST", "Rs " + Number(o.cgst_amount).toFixed(0)) + LF);
  if (Number(o.sgst_amount ?? 0) > 0)
    buf.push(padLine("SGST", "Rs " + Number(o.sgst_amount).toFixed(0)) + LF);
  if (Number(o.takeaway_charges ?? 0) > 0)
    buf.push(padLine("Packing", "Rs " + Number(o.takeaway_charges).toFixed(0)) + LF);
  buf.push(divider());
  buf.push(BOLD_ON, SIZE_DOUBLE);
  buf.push(padLine("TOTAL", "Rs " + Number(o.total_amount).toFixed(0)) + LF);
  buf.push(SIZE_NORMAL, BOLD_OFF);
  buf.push(divider("="));

  buf.push(ALIGN_CENTER);
  buf.push("Thank you. Visit again." + LF);
  buf.push(FEED_3);
  buf.push(CUT);

  const data = bytes(...buf);

  // Cast: Buffer is a valid BodyInit at runtime, but the TS lib types in
  // this Next/Node combination don't accept it without coercion.
  return new NextResponse(data as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `inline; filename="receipt-${o.id}.bin"`,
      "X-Print-Width-Mm": "80",
    },
  });
}
