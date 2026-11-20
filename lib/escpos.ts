// Isomorphic ESC/POS byte stream generator (compatible with Browser WebUSB,
// LAN print bridge agents, 58mm/80mm thermal printers, and RJ11 cash drawers).
// Reference: https://reference.epson-biz.com/modules/ref_escpos/

const ESC = 0x1b;
const GS = 0x1d;

export const INIT = [ESC, 0x40]; // ESC @
export const CUT = [GS, 0x56, 0x00]; // GS V 0 (full cut)
export const ALIGN_LEFT = [ESC, 0x61, 0x00];
export const ALIGN_CENTER = [ESC, 0x61, 0x01];
export const BOLD_ON = [ESC, 0x45, 0x01];
export const BOLD_OFF = [ESC, 0x45, 0x00];
export const SIZE_DOUBLE = [GS, 0x21, 0x11]; // double width + height
export const SIZE_TALL = [GS, 0x21, 0x01]; // double height
export const SIZE_NORMAL = [GS, 0x21, 0x00];
export const DRAWER_KICK_BYTES = new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xfa]); // ESC p 0 25 250
const LF = "\n";
const FEED_3 = "\n\n\n";

function sanitizeAscii(text: string): string {
  return text.replace(/₹/g, "Rs ").replace(/[^\x20-\x7e\n]/g, " ");
}

function packBytes(...parts: Array<number | number[] | Uint8Array | string>): Uint8Array {
  const arr: number[] = [];
  for (const p of parts) {
    if (typeof p === "number") {
      arr.push(p & 0xff);
    } else if (typeof p === "string") {
      const clean = sanitizeAscii(p);
      for (let i = 0; i < clean.length; i++) {
        arr.push(clean.charCodeAt(i) & 0xff);
      }
    } else {
      for (let i = 0; i < p.length; i++) {
        arr.push(p[i] & 0xff);
      }
    }
  }
  return new Uint8Array(arr);
}

function colsForWidth(paperWidth?: number): number {
  return paperWidth === 58 ? 24 : 32;
}

function padLine(left: string, right: string, cap: number): string {
  const space = Math.max(1, cap - left.length - right.length);
  return left + " ".repeat(space) + right;
}

function divider(cap: number, char = "-"): string {
  return char.repeat(cap) + LF;
}

function wrap(text: string, cap: number, indent = ""): string {
  const inner = Math.max(8, cap - indent.length);
  const out: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (!word) continue;
    if (line && line.length + 1 + word.length > inner) {
      out.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
    while (line.length > inner) {
      out.push(line.slice(0, inner));
      line = line.slice(inner);
    }
  }
  if (line) out.push(line);
  return out.map((l) => indent + l + LF).join("");
}

export function buildEscPosDrawerKickBytes(): Uint8Array {
  return new Uint8Array(DRAWER_KICK_BYTES);
}

export function buildEscPosTestSlip(params: {
  outletName: string;
  paperWidth?: 58 | 80;
  kickDrawer?: boolean;
}): Uint8Array {
  const cap = colsForWidth(params.paperWidth);
  const parts: Array<number | number[] | Uint8Array | string> = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    SIZE_DOUBLE,
    "PRINTER READY" + LF,
    SIZE_NORMAL,
    BOLD_OFF,
    (params.outletName || "BILLJOT POS") + LF,
    divider(cap, "="),
    ALIGN_LEFT,
    `Paper width: ${params.paperWidth === 58 ? 58 : 80}mm (${cap} cols)` + LF,
    `Tested at: ${new Date().toLocaleTimeString("en-IN")}` + LF,
    params.kickDrawer ? "Cash drawer kick: SENT" + LF : "",
    divider(cap, "-"),
    ALIGN_CENTER,
    "Silent thermal printing active." + LF,
    FEED_3,
    CUT,
  ];
  if (params.kickDrawer) {
    parts.push(DRAWER_KICK_BYTES);
  }
  return packBytes(...parts);
}

export type EscPosReceiptItem = {
  name: string;
  quantity: number;
  totalPrice: number;
  modifiers?: string[];
  instructions?: string | null;
};

export type EscPosReceiptInput = {
  outletName: string;
  address?: string | null;
  gstin?: string | null;
  fssai?: string | null;
  phone?: string | null;
  billNumber: string;
  source: string;
  tokenNumber?: number | null;
  placedAtLabel: string;
  orderType: string;
  customerName?: string | null;
  tenderLabel?: string | null;
  items: EscPosReceiptItem[];
  orderNote?: string | null;
  subtotal: number;
  cgst: number;
  sgst: number;
  packingCharge?: number;
  discountAmount?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountAmount?: number;
  loyaltyPointsEarned?: number;
  roundingAmount?: number;
  totalAmount: number;
  paperWidth?: 58 | 80;
  kickDrawer?: boolean;
};

export function buildEscPosReceiptBytes(input: EscPosReceiptInput): Uint8Array {
  const cap = colsForWidth(input.paperWidth);
  const nameCol = cap === 24 ? 12 : 18;
  const buf: Array<number | number[] | Uint8Array | string> = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    SIZE_DOUBLE,
    (input.outletName || "OUTLET") + LF,
    SIZE_NORMAL,
    BOLD_OFF,
  ];
  if (input.address) buf.push(wrap(input.address, cap));
  if (input.gstin) buf.push(`GSTIN: ${input.gstin}` + LF);
  if (input.fssai) buf.push(`FSSAI: ${input.fssai}` + LF);
  if (input.phone) buf.push(`Ph: ${input.phone}` + LF);
  buf.push(divider(cap, "="));
  buf.push(ALIGN_LEFT);
  buf.push(`Bill: ${input.billNumber}` + LF);
  buf.push(`Source: ${input.source.toUpperCase()}` + LF);
  if (input.tokenNumber != null) {
    buf.push(ALIGN_CENTER, BOLD_ON, SIZE_DOUBLE);
    buf.push(`TOKEN ${input.tokenNumber}` + LF);
    buf.push(SIZE_NORMAL, BOLD_OFF, ALIGN_LEFT);
  }
  if (input.placedAtLabel) buf.push(input.placedAtLabel + LF);
  buf.push(`Type: ${input.orderType}` + LF);
  if (input.customerName && input.customerName !== "Walk-in") {
    buf.push(wrap(`Guest: ${input.customerName}`, cap));
  }
  if (input.tenderLabel) buf.push(wrap(`Paid: ${input.tenderLabel}`, cap));
  buf.push(divider(cap));

  buf.push(BOLD_ON, padLine("Item", "Qty   Rs", cap) + LF, BOLD_OFF);
  buf.push(divider(cap));
  for (const line of input.items) {
    const name = (line.name || "Item").slice(0, nameCol);
    const qty = String(line.quantity);
    const total = Number(line.totalPrice).toFixed(0);
    buf.push(padLine(name, `${qty.padStart(3)}  ${total.padStart(4)}`, cap) + LF);
    if (line.modifiers && line.modifiers.length > 0) {
      buf.push(wrap(line.modifiers.join(", "), cap, "  "));
    }
    if (line.instructions) {
      buf.push(wrap(`* ${line.instructions}`, cap, "  "));
    }
  }
  buf.push(divider(cap));
  if (input.orderNote) {
    buf.push(BOLD_ON, "NOTE" + LF, BOLD_OFF);
    buf.push(wrap(input.orderNote, cap));
    buf.push(divider(cap));
  }

  buf.push(padLine("Subtotal", `Rs ${Number(input.subtotal || 0).toFixed(0)}`, cap) + LF);
  if (Number(input.cgst || 0) > 0) {
    buf.push(padLine("CGST", `Rs ${Number(input.cgst).toFixed(0)}`, cap) + LF);
  }
  if (Number(input.sgst || 0) > 0) {
    buf.push(padLine("SGST", `Rs ${Number(input.sgst).toFixed(0)}`, cap) + LF);
  }
  if (Number(input.packingCharge || 0) > 0) {
    buf.push(padLine("Packing", `Rs ${Number(input.packingCharge).toFixed(0)}`, cap) + LF);
  }
  if (Number(input.discountAmount || 0) > 0) {
    buf.push(padLine("Discount", `-Rs ${Number(input.discountAmount).toFixed(0)}`, cap) + LF);
  }
  if (Number(input.loyaltyDiscountAmount || 0) > 0) {
    buf.push(
      padLine(
        `Loyalty (${input.loyaltyPointsRedeemed ?? 0}p)`,
        `-Rs ${Number(input.loyaltyDiscountAmount).toFixed(0)}`,
        cap,
      ) + LF,
    );
  }
  if (Number(input.roundingAmount || 0) !== 0) {
    const r = Number(input.roundingAmount);
    buf.push(padLine("Round-off", `${r > 0 ? "+" : ""}Rs ${r.toFixed(2)}`, cap) + LF);
  }
  buf.push(divider(cap));
  buf.push(BOLD_ON, SIZE_DOUBLE);
  buf.push(padLine("TOTAL", `Rs ${Number(input.totalAmount).toFixed(0)}`, cap) + LF);
  buf.push(SIZE_NORMAL, BOLD_OFF);
  if (Number(input.loyaltyPointsEarned || 0) > 0) {
    buf.push(
      ALIGN_CENTER,
      `Earned +${input.loyaltyPointsEarned} loyalty pts today!` + LF,
    );
  }
  buf.push(divider(cap, "="));

  buf.push(ALIGN_CENTER);
  buf.push("Thank you. Visit again." + LF);
  buf.push(FEED_3);
  buf.push(CUT);
  if (input.kickDrawer) {
    buf.push(DRAWER_KICK_BYTES);
  }
  return packBytes(...buf);
}

export type EscPosKotItem = {
  name: string;
  quantity: number;
  modifiers?: string[];
  instructions?: string | null;
};

export type EscPosKotInput = {
  outletName: string;
  stationName?: string | null;
  billNumber: string;
  tokenNumber?: number | null;
  tableLabel?: string | null;
  orderType: string;
  kotRound?: number;
  placedAtLabel: string;
  orderNote?: string | null;
  items: EscPosKotItem[];
  paperWidth?: 58 | 80;
};

export function buildEscPosKotBytes(input: EscPosKotInput): Uint8Array {
  const cap = colsForWidth(input.paperWidth);
  const stationBanner = input.stationName?.trim()
    ? `KOT - ${input.stationName.trim().toUpperCase()}`
    : "KITCHEN ORDER TICKET";

  const buf: Array<number | number[] | Uint8Array | string> = [
    INIT,
    ALIGN_CENTER,
    BOLD_ON,
    SIZE_DOUBLE,
    stationBanner + LF,
    SIZE_NORMAL,
    (input.outletName || "OUTLET") + LF,
    BOLD_OFF,
  ];

  if ((input.kotRound ?? 1) > 1) {
    buf.push(BOLD_ON, `*** ADD-ON KOT ROUND #${input.kotRound} ***` + LF, BOLD_OFF);
  }

  buf.push(divider(cap, "="));
  buf.push(ALIGN_LEFT);
  if (input.tokenNumber != null) {
    buf.push(ALIGN_CENTER, BOLD_ON, SIZE_DOUBLE);
    buf.push(`TOKEN #${input.tokenNumber}` + LF);
    buf.push(SIZE_NORMAL, BOLD_OFF, ALIGN_LEFT);
  }
  buf.push(`Order: ${input.billNumber}` + LF);
  buf.push(
    `Type: ${input.orderType.toUpperCase()}${input.tableLabel ? ` | ${input.tableLabel}` : ""}` +
      LF,
  );
  if (input.placedAtLabel) buf.push(`Time: ${input.placedAtLabel}` + LF);
  buf.push(divider(cap));

  for (const item of input.items) {
    buf.push(BOLD_ON, SIZE_TALL);
    buf.push(wrap(`${item.quantity}x ${item.name}`, cap));
    buf.push(SIZE_NORMAL, BOLD_OFF);
    if (item.modifiers && item.modifiers.length > 0) {
      buf.push(wrap(item.modifiers.join(", "), cap, "  + "));
    }
    if (item.instructions) {
      buf.push(wrap(`NOTE: ${item.instructions}`, cap, "  * "));
    }
  }

  if (input.orderNote) {
    buf.push(divider(cap));
    buf.push(BOLD_ON, "ORDER NOTE:" + LF, BOLD_OFF);
    buf.push(wrap(input.orderNote, cap));
  }

  buf.push(divider(cap, "="));
  buf.push(FEED_3);
  buf.push(CUT);
  return packBytes(...buf);
}
