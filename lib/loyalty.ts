import type { createAdminClient } from "@/lib/supabase/admin";
import type { LoyaltySettings, LoyaltyWallet } from "./types";

type AdminDb = ReturnType<typeof createAdminClient>;

export const DEFAULT_LOYALTY_SETTINGS: Omit<
  LoyaltySettings,
  "restaurant_id" | "created_at" | "updated_at"
> = {
  is_enabled: true,
  points_per_100: 5,
  point_value: 1,
  min_order_for_earn: 100,
  min_points_to_redeem: 25,
  max_redeem_pct: 25,
  welcome_bonus_points: 25,
};

export function normalizeLoyaltyPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return null;
}

export function computeMaxRedeemablePoints(params: {
  balance: number;
  orderSubtotal: number;
  settings: Pick<
    LoyaltySettings,
    "is_enabled" | "point_value" | "min_points_to_redeem" | "max_redeem_pct"
  >;
}): { maxPoints: number; rupeeDiscount: number; eligible: boolean } {
  const balance = Math.max(0, Math.floor(Number(params.balance) || 0));
  const subtotal = Math.max(0, Number(params.orderSubtotal) || 0);
  const pointValue = Math.max(0.01, Number(params.settings.point_value) || 1);
  const minPoints = Math.max(1, Math.floor(Number(params.settings.min_points_to_redeem) || 1));
  const maxPct = Math.min(100, Math.max(0, Number(params.settings.max_redeem_pct) || 0));

  if (!params.settings.is_enabled || balance < minPoints || subtotal <= 0 || maxPct <= 0) {
    return { maxPoints: 0, rupeeDiscount: 0, eligible: false };
  }

  const maxRupeeAllowed = (subtotal * maxPct) / 100;
  const maxPointsByCap = Math.floor(maxRupeeAllowed / pointValue);
  const maxPoints = Math.min(balance, maxPointsByCap);
  if (maxPoints < minPoints) {
    return { maxPoints: 0, rupeeDiscount: 0, eligible: false };
  }
  const rupeeDiscount = Math.round(maxPoints * pointValue * 100) / 100;
  return { maxPoints, rupeeDiscount, eligible: true };
}

export function computeEarnedPoints(params: {
  netPaidAmount: number;
  isFirstVisit: boolean;
  settings: Pick<
    LoyaltySettings,
    "is_enabled" | "points_per_100" | "min_order_for_earn" | "welcome_bonus_points"
  >;
}): { earnedPoints: number; welcomeBonus: number; totalCredited: number } {
  if (!params.settings.is_enabled) {
    return { earnedPoints: 0, welcomeBonus: 0, totalCredited: 0 };
  }
  const paid = Math.max(0, Number(params.netPaidAmount) || 0);
  const minOrder = Math.max(0, Number(params.settings.min_order_for_earn) || 0);
  const rate = Math.max(0, Number(params.settings.points_per_100) || 0);
  const welcomeBonus = params.isFirstVisit
    ? Math.max(0, Math.floor(Number(params.settings.welcome_bonus_points) || 0))
    : 0;
  const earnedPoints =
    paid >= minOrder && rate > 0 ? Math.floor((paid / 100) * rate) : 0;

  return {
    earnedPoints,
    welcomeBonus,
    totalCredited: earnedPoints + welcomeBonus,
  };
}

export async function getLoyaltySettings(
  db: AdminDb,
  restaurantId: string,
): Promise<LoyaltySettings> {
  const { data } = await db
    .from("loyalty_settings")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (data) return data as LoyaltySettings;
  const nowIso = new Date().toISOString();
  return {
    restaurant_id: restaurantId,
    ...DEFAULT_LOYALTY_SETTINGS,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export async function lookupLoyaltyWalletByPhone(
  db: AdminDb,
  restaurantId: string,
  rawPhone: string | null | undefined,
): Promise<{ wallet: LoyaltyWallet | null; phoneNormalized: string | null }> {
  const phoneNormalized = normalizeLoyaltyPhone(rawPhone);
  if (!phoneNormalized) {
    return { wallet: null, phoneNormalized: null };
  }
  const { data } = await db
    .from("loyalty_wallets")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("phone_normalized", phoneNormalized)
    .maybeSingle();

  return {
    wallet: (data as LoyaltyWallet | null) ?? null,
    phoneNormalized,
  };
}

export async function applyOrderLoyaltyOnSettlement(
  db: AdminDb,
  params: {
    restaurantId: string;
    outletId: string;
    orderId: string;
    customerPhone?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    orderSubtotal: number;
    netPaidAmount: number;
    requestedRedeemPoints?: number;
    createdBy?: string | null;
  },
): Promise<{
  applied: boolean;
  pointsRedeemed: number;
  discountApplied: number;
  pointsEarned: number;
  balanceAfter: number;
}> {
  const phoneNormalized = normalizeLoyaltyPhone(params.customerPhone);
  if (!phoneNormalized) {
    return {
      applied: false,
      pointsRedeemed: 0,
      discountApplied: 0,
      pointsEarned: 0,
      balanceAfter: 0,
    };
  }

  const settings = await getLoyaltySettings(db, params.restaurantId);
  if (!settings.is_enabled) {
    return {
      applied: false,
      pointsRedeemed: 0,
      discountApplied: 0,
      pointsEarned: 0,
      balanceAfter: 0,
    };
  }

  const nowIso = new Date().toISOString();
  const { data: existingWallet } = await db
    .from("loyalty_wallets")
    .select("*")
    .eq("restaurant_id", params.restaurantId)
    .eq("phone_normalized", phoneNormalized)
    .maybeSingle();

  let wallet = existingWallet as LoyaltyWallet | null;
  const isFirstVisit = !wallet || wallet.visits_count === 0;

  if (!wallet) {
    const cleanEmail =
      params.customerEmail &&
      !params.customerEmail.startsWith("pos+") &&
      !params.customerEmail.startsWith("guest+")
        ? params.customerEmail
        : null;
    const { data: created, error: createErr } = await db
      .from("loyalty_wallets")
      .insert({
        restaurant_id: params.restaurantId,
        phone_normalized: phoneNormalized,
        customer_name: params.customerName?.trim() || null,
        customer_email: cleanEmail,
        points_balance: 0,
        lifetime_earned: 0,
        lifetime_redeemed: 0,
        visits_count: 0,
        total_spent: 0,
        last_visit_at: nowIso,
      })
      .select("*")
      .single();

    if (createErr && createErr.code === "23505") {
      const { data: raced } = await db
        .from("loyalty_wallets")
        .select("*")
        .eq("restaurant_id", params.restaurantId)
        .eq("phone_normalized", phoneNormalized)
        .maybeSingle();
      wallet = (raced as LoyaltyWallet | null) ?? null;
    } else if (created) {
      wallet = created as LoyaltyWallet;
    }
  }

  if (!wallet) {
    return {
      applied: false,
      pointsRedeemed: 0,
      discountApplied: 0,
      pointsEarned: 0,
      balanceAfter: 0,
    };
  }

  let runningBalance = wallet.points_balance;
  let pointsRedeemed = 0;
  let discountApplied = 0;

  // 1. Redemption (if requested)
  const reqPts = Math.max(0, Math.floor(Number(params.requestedRedeemPoints) || 0));
  if (reqPts > 0 && runningBalance > 0) {
    const { data: existingRedeem } = await db
      .from("loyalty_transactions")
      .select("id, points_delta, rupee_value")
      .eq("order_id", params.orderId)
      .eq("txn_type", "redeem")
      .maybeSingle();

    if (!existingRedeem) {
      const cap = computeMaxRedeemablePoints({
        balance: runningBalance,
        orderSubtotal: params.orderSubtotal,
        settings,
      });
      const redeemPts = Math.min(reqPts, cap.maxPoints);
      if (redeemPts >= settings.min_points_to_redeem && redeemPts > 0) {
        const discountVal = Math.round(redeemPts * Number(settings.point_value) * 100) / 100;
        const nextBal = Math.max(0, runningBalance - redeemPts);
        const { error: redeemErr } = await db.from("loyalty_transactions").insert({
          restaurant_id: params.restaurantId,
          wallet_id: wallet.id,
          outlet_id: params.outletId,
          order_id: params.orderId,
          txn_type: "redeem",
          points_delta: -redeemPts,
          rupee_value: discountVal,
          balance_after: nextBal,
          note: "Redeemed at billing",
          created_by: params.createdBy ?? null,
        });
        if (!redeemErr) {
          runningBalance = nextBal;
          pointsRedeemed = redeemPts;
          discountApplied = discountVal;
        }
      }
    }
  }

  // 2. Welcome bonus + Order Earn (idempotent per order_id + txn_type)
  const { data: existingEarnTxns } = await db
    .from("loyalty_transactions")
    .select("txn_type, points_delta")
    .eq("order_id", params.orderId)
    .in("txn_type", ["earn", "welcome_bonus"]);

  const alreadyHasEarn = (existingEarnTxns ?? []).some((t) => t.txn_type === "earn");
  const alreadyHasWelcome = (existingEarnTxns ?? []).some(
    (t) => t.txn_type === "welcome_bonus",
  );

  const earnCalc = computeEarnedPoints({
    netPaidAmount: params.netPaidAmount,
    isFirstVisit: isFirstVisit && !alreadyHasWelcome,
    settings,
  });

  let totalCredited = 0;
  if (!alreadyHasWelcome && earnCalc.welcomeBonus > 0) {
    const nextBal = runningBalance + earnCalc.welcomeBonus;
    const { error: wbErr } = await db.from("loyalty_transactions").insert({
      restaurant_id: params.restaurantId,
      wallet_id: wallet.id,
      outlet_id: params.outletId,
      order_id: params.orderId,
      txn_type: "welcome_bonus",
      points_delta: earnCalc.welcomeBonus,
      rupee_value:
        Math.round(earnCalc.welcomeBonus * Number(settings.point_value) * 100) / 100,
      balance_after: nextBal,
      note: "Welcome bonus points",
      created_by: params.createdBy ?? null,
    });
    if (!wbErr) {
      runningBalance = nextBal;
      totalCredited += earnCalc.welcomeBonus;
    }
  }

  if (!alreadyHasEarn && earnCalc.earnedPoints > 0) {
    const nextBal = runningBalance + earnCalc.earnedPoints;
    const { error: earnErr } = await db.from("loyalty_transactions").insert({
      restaurant_id: params.restaurantId,
      wallet_id: wallet.id,
      outlet_id: params.outletId,
      order_id: params.orderId,
      txn_type: "earn",
      points_delta: earnCalc.earnedPoints,
      rupee_value:
        Math.round(earnCalc.earnedPoints * Number(settings.point_value) * 100) / 100,
      balance_after: nextBal,
      note: `Earned on ₹${Math.round(params.netPaidAmount)} bill`,
      created_by: params.createdBy ?? null,
    });
    if (!earnErr) {
      runningBalance = nextBal;
      totalCredited += earnCalc.earnedPoints;
    }
  }

  const nextName =
    wallet.customer_name ||
    (params.customerName && params.customerName !== "Walk-in"
      ? params.customerName.trim()
      : null);
  const nextEmail =
    wallet.customer_email ||
    (params.customerEmail &&
    !params.customerEmail.startsWith("pos+") &&
    !params.customerEmail.startsWith("guest+")
      ? params.customerEmail
      : null);

  if (totalCredited > 0 || pointsRedeemed > 0 || (!alreadyHasEarn && params.netPaidAmount > 0)) {
    await db
      .from("loyalty_wallets")
      .update({
        customer_name: nextName,
        customer_email: nextEmail,
        points_balance: runningBalance,
        lifetime_earned: wallet.lifetime_earned + totalCredited,
        lifetime_redeemed: wallet.lifetime_redeemed + pointsRedeemed,
        visits_count: !alreadyHasEarn ? wallet.visits_count + 1 : wallet.visits_count,
        total_spent:
          !alreadyHasEarn
            ? Math.round((Number(wallet.total_spent) + Math.max(0, params.netPaidAmount)) * 100) /
              100
            : wallet.total_spent,
        last_visit_at: nowIso,
      })
      .eq("id", wallet.id);
  }

  if (pointsRedeemed > 0 || totalCredited > 0) {
    await db
      .from("orders")
      .update({
        ...(pointsRedeemed > 0
          ? {
              loyalty_points_redeemed: pointsRedeemed,
              loyalty_discount_amount: discountApplied,
            }
          : {}),
        ...(totalCredited > 0 ? { loyalty_points_earned: totalCredited } : {}),
      })
      .eq("id", params.orderId);
  }

  return {
    applied: true,
    pointsRedeemed,
    discountApplied,
    pointsEarned: totalCredited,
    balanceAfter: runningBalance,
  };
}
