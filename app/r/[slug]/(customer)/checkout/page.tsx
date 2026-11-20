import { notFound } from "next/navigation";
import { getPublicOutlets, getPublicRestaurant } from "@/lib/auth";
import { STOREFRONT_COUPONS, type CouponRuleShape } from "@/lib/coupons";
import { getPublicPaymentConfig } from "@/lib/payments";
import { getLoyaltySettings } from "@/lib/loyalty";
import { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cancelled?: string }>;
};

const FALLBACK_COUPONS: CouponRuleShape[] = [
  {
    code: STOREFRONT_COUPONS[0].code,
    title: STOREFRONT_COUPONS[0].label,
    discount_type: "flat",
    discount_value: 50,
    min_order_amount: 299,
    channel: "all",
    is_active: true,
  },
  {
    code: STOREFRONT_COUPONS[1].code,
    title: STOREFRONT_COUPONS[1].label,
    discount_type: "percentage",
    discount_value: 10,
    max_discount: 100,
    min_order_amount: 399,
    channel: "all",
    is_active: true,
  },
  {
    code: STOREFRONT_COUPONS[2].code,
    title: STOREFRONT_COUPONS[2].label,
    discount_type: "flat",
    discount_value: 100,
    min_order_amount: 699,
    channel: "all",
    is_active: true,
  },
];

export default async function CheckoutPage(props: Props) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const restaurant = await getPublicRestaurant(params.slug);
  if (!restaurant) notFound();

  const outlet = (await getPublicOutlets(restaurant.id))[0] ?? null;
  if (!outlet) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        This restaurant isn&apos;t accepting orders yet (no outlet configured).
      </p>
    );
  }

  const admin = createAdminClient();
  const nowMs = Date.now();
  const [paymentConfig, dbCouponsRes, anyCouponCountRes, loyaltySettings] =
    await Promise.all([
      getPublicPaymentConfig(outlet.id),
      admin
        .from("coupons")
        .select(
          "code, title, discount_type, discount_value, max_discount, min_order_amount, channel, usage_limit, used_count, expires_at, is_active",
        )
        .eq("restaurant_id", restaurant.id)
        .eq("is_active", true)
        .in("channel", ["all", "storefront", "dine_in"])
        .order("min_order_amount", { ascending: true }),
      admin
        .from("coupons")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurant.id),
      getLoyaltySettings(admin, restaurant.id),
    ]);

  const dbCoupons = (dbCouponsRes.data ?? []).filter((c) => {
    if (c.expires_at && new Date(c.expires_at).getTime() <= nowMs) return false;
    if (c.usage_limit && c.used_count >= c.usage_limit) return false;
    return true;
  });

  const availableCoupons: CouponRuleShape[] =
    (anyCouponCountRes.count ?? 0) > 0
      ? dbCoupons
      : FALLBACK_COUPONS;

  return (
    <CheckoutForm
      restaurantSlug={params.slug}
      restaurantName={restaurant.name}
      outletId={outlet.id}
      paymentConfig={paymentConfig}
      availableCoupons={availableCoupons}
      loyaltySettings={{
        isEnabled: loyaltySettings.is_enabled,
        pointsPer100: Number(loyaltySettings.points_per_100),
        minOrderForEarn: Number(loyaltySettings.min_order_for_earn),
        welcomeBonusPoints: loyaltySettings.welcome_bonus_points,
      }}
      wasCancelled={searchParams.cancelled === "1"}
    />
  );
}
