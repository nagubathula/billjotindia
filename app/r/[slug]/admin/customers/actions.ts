"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import type { CouponChannel, CouponDiscountType } from "@/lib/coupons";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Coupon } from "@/lib/types";
import { getLoyaltySettings, normalizeLoyaltyPhone } from "@/lib/loyalty";
import type { LoyaltySettings, LoyaltyWallet } from "@/lib/types";
import { isUuid } from "@/lib/utils";

const VALID_CHANNELS = new Set<CouponChannel>(["all", "storefront", "pos", "dine_in"]);

async function authorizeOps(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;
  await requireRole(["admin", "manager"], {
    restaurantId: restaurant.id,
  });
  return restaurant;
}

function revalidateCouponPaths(slug: string) {
  revalidatePath(`/r/${slug}/admin/customers`);
  revalidatePath(`/r/${slug}/checkout`);
  revalidatePath(`/r/${slug}/pos`);
}

export async function createCouponAction(
  slug: string,
  input: {
    code: string;
    title: string;
    discount_type: CouponDiscountType;
    discount_value: number;
    max_discount?: number | null;
    min_order_amount?: number;
    channel?: CouponChannel;
    usage_limit?: number | null;
    expires_at?: string | null;
  },
): Promise<{ ok: true; coupon: Coupon } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };

  const code = String(input.code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  if (code.length < 2 || code.length > 24) {
    return {
      ok: false,
      error: "Coupon code must be 2–24 letters or digits (e.g. WELCOME50).",
    };
  }

  const title = String(input.title ?? "").trim();
  if (title.length < 2) {
    return { ok: false, error: "Enter a short offer description." };
  }

  const discountType: CouponDiscountType =
    input.discount_type === "percentage" ? "percentage" : "flat";
  const discountValue = Number(input.discount_value);
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { ok: false, error: "Discount value must be greater than zero." };
  }
  if (discountType === "percentage" && discountValue > 100) {
    return { ok: false, error: "Percentage discount cannot exceed 100%." };
  }

  const maxDiscount =
    discountType === "percentage" &&
    input.max_discount != null &&
    Number(input.max_discount) > 0
      ? Math.round(Number(input.max_discount) * 100) / 100
      : null;

  const minOrderAmount = Math.max(
    0,
    Math.round((Number(input.min_order_amount ?? 0) || 0) * 100) / 100,
  );
  const channel: CouponChannel = VALID_CHANNELS.has(input.channel as CouponChannel)
    ? (input.channel as CouponChannel)
    : "all";
  const usageLimit =
    input.usage_limit != null && Number(input.usage_limit) > 0
      ? Math.floor(Number(input.usage_limit))
      : null;
  const expiresAt =
    input.expires_at && /^\d{4}-\d{2}-\d{2}/.test(input.expires_at)
      ? new Date(`${input.expires_at.slice(0, 10)}T23:59:59+05:30`).toISOString()
      : null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("coupons")
    .insert({
      restaurant_id: restaurant.id,
      code,
      title: title.slice(0, 140),
      discount_type: discountType,
      discount_value: Math.round(discountValue * 100) / 100,
      max_discount: maxDiscount,
      min_order_amount: minOrderAmount,
      channel,
      usage_limit: usageLimit,
      expires_at: expiresAt,
      is_active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { ok: false, error: `Coupon code "${code}" already exists.` };
    }
    return { ok: false, error: error?.message ?? "Failed to create coupon." };
  }

  revalidateCouponPaths(slug);
  return { ok: true, coupon: data as Coupon };
}

export async function toggleCouponActiveAction(
  slug: string,
  couponId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(couponId)) return { ok: false, error: "Invalid coupon ID." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("coupons")
    .update({ is_active: Boolean(isActive) })
    .eq("id", couponId)
    .eq("restaurant_id", restaurant.id);

  if (error) return { ok: false, error: error.message };
  revalidateCouponPaths(slug);
  return { ok: true };
}

export async function deleteCouponAction(
  slug: string,
  couponId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  if (!isUuid(couponId)) return { ok: false, error: "Invalid coupon ID." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("coupons")
    .delete()
    .eq("id", couponId)
    .eq("restaurant_id", restaurant.id);

  if (error) return { ok: false, error: error.message };
  revalidateCouponPaths(slug);
  return { ok: true };
}

export async function saveLoyaltySettingsAction(
  slug: string,
  input: {
    is_enabled: boolean;
    points_per_100: number;
    point_value: number;
    min_order_for_earn: number;
    min_points_to_redeem: number;
    max_redeem_pct: number;
    welcome_bonus_points: number;
  },
): Promise<{ ok: true; settings: LoyaltySettings } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };

  const payload = {
    restaurant_id: restaurant.id,
    is_enabled: Boolean(input.is_enabled),
    points_per_100: Math.max(0, Number(input.points_per_100) || 0),
    point_value: Math.max(0.01, Number(input.point_value) || 1),
    min_order_for_earn: Math.max(0, Number(input.min_order_for_earn) || 0),
    min_points_to_redeem: Math.max(1, Math.floor(Number(input.min_points_to_redeem) || 25)),
    max_redeem_pct: Math.min(100, Math.max(0, Number(input.max_redeem_pct) || 0)),
    welcome_bonus_points: Math.max(0, Math.floor(Number(input.welcome_bonus_points) || 0)),
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("loyalty_settings")
    .upsert(payload, { onConflict: "restaurant_id" })
    .select("*")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to update loyalty settings." };
  }

  revalidateCouponPaths(slug);
  return { ok: true, settings: data as LoyaltySettings };
}

export async function adjustLoyaltyWalletPointsAction(
  slug: string,
  input: {
    phone: string;
    customerName?: string;
    pointsDelta: number;
    note?: string;
  },
): Promise<{ ok: true; wallet: LoyaltyWallet } | { ok: false; error: string }> {
  const restaurant = await authorizeOps(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };

  const phone = normalizeLoyaltyPhone(input.phone);
  if (!phone) {
    return { ok: false, error: "Enter a valid 10-digit guest phone number." };
  }
  const delta = Math.trunc(Number(input.pointsDelta) || 0);
  if (delta === 0) {
    return { ok: false, error: "Enter non-zero adjustment points (+ or -)." };
  }

  const admin = createAdminClient();
  const [settings, existingRes] = await Promise.all([
    getLoyaltySettings(admin, restaurant.id),
    admin
      .from("loyalty_wallets")
      .select("*")
      .eq("restaurant_id", restaurant.id)
      .eq("phone_normalized", phone)
      .maybeSingle(),
  ]);

  let wallet = existingRes.data as LoyaltyWallet | null;
  if (!wallet) {
    if (delta < 0) {
      return { ok: false, error: "Wallet does not exist yet to deduct points from." };
    }
    const { data: created, error: createErr } = await admin
      .from("loyalty_wallets")
      .insert({
        restaurant_id: restaurant.id,
        phone_normalized: phone,
        customer_name: input.customerName?.trim() || null,
        points_balance: 0,
        lifetime_earned: 0,
        lifetime_redeemed: 0,
        visits_count: 0,
        total_spent: 0,
      })
      .select("*")
      .single();
    if (createErr || !created) {
      return { ok: false, error: createErr?.message ?? "Failed to create wallet." };
    }
    wallet = created as LoyaltyWallet;
  }

  const nextBalance = Math.max(0, wallet.points_balance + delta);
  const effectiveDelta = nextBalance - wallet.points_balance;
  if (effectiveDelta === 0) {
    return { ok: false, error: "Wallet balance is already zero." };
  }

  const rupeeVal = Math.round(Math.abs(effectiveDelta) * Number(settings.point_value) * 100) / 100;
  const { error: txnErr } = await admin.from("loyalty_transactions").insert({
    restaurant_id: restaurant.id,
    wallet_id: wallet.id,
    txn_type: "adjustment",
    points_delta: effectiveDelta,
    rupee_value: rupeeVal,
    balance_after: nextBalance,
    note: input.note?.trim() || (effectiveDelta > 0 ? "Manual bonus" : "Manual deduction"),
  });
  if (txnErr) return { ok: false, error: txnErr.message };

  const { data: updated, error: updErr } = await admin
    .from("loyalty_wallets")
    .update({
      ...(input.customerName?.trim() && !wallet.customer_name
        ? { customer_name: input.customerName.trim() }
        : {}),
      points_balance: nextBalance,
      lifetime_earned:
        effectiveDelta > 0 ? wallet.lifetime_earned + effectiveDelta : wallet.lifetime_earned,
      lifetime_redeemed:
        effectiveDelta < 0
          ? wallet.lifetime_redeemed + Math.abs(effectiveDelta)
          : wallet.lifetime_redeemed,
    })
    .eq("id", wallet.id)
    .select("*")
    .single();

  if (updErr || !updated) {
    return { ok: false, error: updErr?.message ?? "Failed to update wallet." };
  }

  revalidateCouponPaths(slug);
  return { ok: true, wallet: updated as LoyaltyWallet };
}
