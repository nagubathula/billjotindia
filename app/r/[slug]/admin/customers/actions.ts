"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import type { CouponChannel, CouponDiscountType } from "@/lib/coupons";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Coupon } from "@/lib/types";
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
