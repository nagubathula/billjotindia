// Customer-facing layout for a restaurant's storefront. Wraps the menu,
// cart, checkout, and order-confirmation pages with a restaurant-aware
// navbar + slug-scoped cart provider. Admin routes under /r/[slug]/admin
// use a different layout and don't inherit this chrome.

import { notFound } from "next/navigation";
import { CartProvider } from "@/components/CartProvider";
import { StorefrontNavbar } from "@/components/StorefrontNavbar";
import { getPublicRestaurant } from "@/lib/auth";

type Props = {
  children: React.ReactNode;
  params: { slug: string };
};

export default async function CustomerLayout({ children, params }: Props) {
  const restaurant = await getPublicRestaurant(params.slug);
  if (!restaurant) notFound();

  return (
    <CartProvider restaurantSlug={params.slug}>
      <StorefrontNavbar
        restaurantSlug={params.slug}
        restaurantName={restaurant.name}
      />
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </CartProvider>
  );
}
