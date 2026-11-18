import type { createAdminClient } from "@/lib/supabase/admin";

export type CouponChannel = "all" | "storefront" | "pos" | "dine_in";
export type CouponDiscountType = "percentage" | "flat";

export type CouponRuleShape = {
  code: string;
  title: string;
  discount_type: CouponDiscountType | string;
  discount_value: number;
  max_discount?: number | null;
  min_order_amount?: number | null;
  channel?: CouponChannel | string | null;
  usage_limit?: number | null;
  used_count?: number | null;
  expires_at?: string | null;
  is_active?: boolean | null;
};

export type PublicCouponSummary = {
  code: string;
  title: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  max_discount: number | null;
  min_order_amount: number;
  label: string;
};

export const COUPON_CHANNELS: ReadonlyArray<{
  value: CouponChannel;
  label: string;
}> = [
  { value: "all", label: "All Channels" },
  { value: "storefront", label: "Web Storefront" },
  { value: "pos", label: "POS Counter" },
  { value: "dine_in", label: "QR Dine-in" },
];

export const COUPON_CHANNEL_LABEL: Record<CouponChannel, string> = {
  all: "All Channels",
  storefront: "Web Storefront",
  pos: "POS Counter",
  dine_in: "QR Dine-in",
};

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export const STOREFRONT_COUPONS: Array<{
  code: string;
  label: string;
  minOrder: number;
  calc: (subtotal: number) => number;
}> = [
  {
    code: "WELCOME50",
    label: "Flat ₹50 OFF above ₹299",
    minOrder: 299,
    calc: () => 50,
  },
  {
    code: "ANDHRA10",
    label: "10% OFF up to ₹100 above ₹399",
    minOrder: 399,
    calc: (sub) => Math.min(100, Math.round(sub * 0.1)),
  },
  {
    code: "BHOJANAM100",
    label: "Flat ₹100 OFF above ₹699",
    minOrder: 699,
    calc: () => 100,
  },
];

export function computeStorefrontCouponDiscount(
  couponCode: string | null | undefined,
  grossItemsTotal: number,
): number {
  if (!couponCode) return 0;
  const clean = couponCode.trim().toUpperCase();
  const found = STOREFRONT_COUPONS.find((c) => c.code === clean);
  if (!found || grossItemsTotal < found.minOrder) return 0;
  return found.calc(grossItemsTotal);
}

export function formatCouponOfferLabel(c: {
  discount_type: string;
  discount_value: number;
  max_discount?: number | null;
  min_order_amount?: number | null;
}): string {
  const val = Number(c.discount_value || 0);
  const maxD = c.max_discount != null ? Number(c.max_discount) : null;
  const minOrd = Number(c.min_order_amount || 0);
  const head =
    c.discount_type === "percentage"
      ? `${val}% OFF${maxD && maxD > 0 ? ` up to ₹${Math.round(maxD)}` : ""}`
      : `Flat ₹${Math.round(val)} OFF`;
  return minOrd > 0 ? `${head} above ₹${Math.round(minOrd)}` : head;
}

export function evaluateCouponDiscount(
  coupon: CouponRuleShape,
  subtotal: number,
  opts?: { channel?: "storefront" | "pos" | "dine_in"; now?: Date },
): { ok: true; discount: number; code: string } | { ok: false; discount: 0; reason: string } {
  const cleanCode = coupon.code.trim().toUpperCase();
  const gross = Math.max(0, Number(subtotal) || 0);

  if (coupon.is_active === false) {
    return { ok: false, discount: 0, reason: `${cleanCode} is currently paused.` };
  }

  const now = opts?.now ?? new Date();
  if (coupon.expires_at) {
    const expMs = new Date(coupon.expires_at).getTime();
    if (Number.isFinite(expMs) && expMs <= now.getTime()) {
      return { ok: false, discount: 0, reason: `${cleanCode} has expired.` };
    }
  }

  if (
    coupon.usage_limit != null &&
    Number(coupon.usage_limit) > 0 &&
    Number(coupon.used_count ?? 0) >= Number(coupon.usage_limit)
  ) {
    return {
      ok: false,
      discount: 0,
      reason: `${cleanCode} has reached its redemption limit.`,
    };
  }

  if (
    opts?.channel &&
    coupon.channel &&
    coupon.channel !== "all" &&
    coupon.channel !== opts.channel
  ) {
    return {
      ok: false,
      discount: 0,
      reason: `${cleanCode} is not valid for ${opts.channel}.`,
    };
  }

  const minOrder = Math.max(0, Number(coupon.min_order_amount ?? 0) || 0);
  if (gross < minOrder) {
    return {
      ok: false,
      discount: 0,
      reason: `Add ₹${Math.ceil(minOrder - gross)} more to use ${cleanCode}.`,
    };
  }

  const value = Math.max(0, Number(coupon.discount_value) || 0);
  let rawDiscount = 0;
  if (coupon.discount_type === "percentage") {
    rawDiscount = round2((gross * Math.min(100, value)) / 100);
    const maxCap = coupon.max_discount != null ? Number(coupon.max_discount) : null;
    if (maxCap && maxCap > 0) {
      rawDiscount = Math.min(rawDiscount, round2(maxCap));
    }
  } else {
    rawDiscount = round2(value);
  }

  const discount = Math.min(gross, Math.max(0, rawDiscount));
  return { ok: true, discount, code: cleanCode };
}

export async function resolveOrderCouponDiscount(
  supabase: ReturnType<typeof createAdminClient>,
  outletId: string,
  rawCode: string | null | undefined,
  grossItemsTotal: number,
  channel: "storefront" | "pos" | "dine_in" = "storefront",
): Promise<number> {
  const clean = (rawCode ?? "").trim().toUpperCase();
  if (!clean) return 0;

  try {
    const { data: outletRow, error: outletErr } = await supabase
      .from("outlets")
      .select("restaurant_id")
      .eq("id", outletId)
      .maybeSingle();

    if (outletErr || !outletRow?.restaurant_id) {
      return computeStorefrontCouponDiscount(clean, grossItemsTotal);
    }

    const { data: couponRow, error: couponErr } = await supabase
      .from("coupons")
      .select(
        "code, title, discount_type, discount_value, max_discount, min_order_amount, channel, usage_limit, used_count, expires_at, is_active",
      )
      .eq("restaurant_id", outletRow.restaurant_id)
      .ilike("code", clean)
      .maybeSingle();

    if (couponErr) {
      return computeStorefrontCouponDiscount(clean, grossItemsTotal);
    }

    if (couponRow) {
      const evaluated = evaluateCouponDiscount(couponRow, grossItemsTotal, { channel });
      return evaluated.ok ? evaluated.discount : 0;
    }

    // If restaurant has no DB coupons yet, allow built-in storefront fallback codes.
    const { count } = await supabase
      .from("coupons")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", outletRow.restaurant_id);
    if (!count || count === 0) {
      return computeStorefrontCouponDiscount(clean, grossItemsTotal);
    }
    return 0;
  } catch {
    return computeStorefrontCouponDiscount(clean, grossItemsTotal);
  }
}

export async function recordCouponRedemption(
  supabase: ReturnType<typeof createAdminClient>,
  outletId: string,
  rawCode: string | null | undefined,
): Promise<void> {
  const clean = (rawCode ?? "").trim().toUpperCase();
  if (!clean) return;
  try {
    const { data: outletRow } = await supabase
      .from("outlets")
      .select("restaurant_id")
      .eq("id", outletId)
      .maybeSingle();
    if (!outletRow?.restaurant_id) return;

    const { data: couponRow } = await supabase
      .from("coupons")
      .select("id, used_count")
      .eq("restaurant_id", outletRow.restaurant_id)
      .ilike("code", clean)
      .maybeSingle();
    if (!couponRow) return;

    await supabase
      .from("coupons")
      .update({ used_count: Number(couponRow.used_count ?? 0) + 1 })
      .eq("id", couponRow.id);
  } catch {
    // Non-fatal counter increment
  }
}
