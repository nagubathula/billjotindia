import { notFound } from "next/navigation";
import { getPublicOutlets, getPublicRestaurant } from "@/lib/auth";
import { getPublicPaymentConfig } from "@/lib/payments";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cancelled?: string }>;
};

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

  const paymentConfig = await getPublicPaymentConfig(outlet.id);

  return (
    <CheckoutForm
      restaurantSlug={params.slug}
      restaurantName={restaurant.name}
      outletId={outlet.id}
      paymentConfig={paymentConfig}
      wasCancelled={searchParams.cancelled === "1"}
    />
  );
}
