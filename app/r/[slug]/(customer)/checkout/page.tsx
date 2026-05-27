import { notFound } from "next/navigation";
import { getDefaultOutletForRestaurant, getRestaurantBySlug } from "@/lib/auth";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export default async function CheckoutPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  const outlet = await getDefaultOutletForRestaurant(restaurant.id);
  if (!outlet) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        This restaurant isn't accepting orders yet (no outlet configured).
      </p>
    );
  }

  return (
    <CheckoutForm
      restaurantSlug={params.slug}
      outletId={outlet.id}
    />
  );
}
