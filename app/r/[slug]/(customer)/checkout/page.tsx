import { notFound } from "next/navigation";
import { getPublicOutlets, getPublicRestaurant } from "@/lib/auth";
import { CheckoutForm } from "./CheckoutForm";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export default async function CheckoutPage({ params }: Props) {
  const restaurant = await getPublicRestaurant(params.slug);
  if (!restaurant) notFound();

  const outlet = (await getPublicOutlets(restaurant.id))[0] ?? null;
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
