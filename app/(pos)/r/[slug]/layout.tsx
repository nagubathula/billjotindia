// Full-screen shell for the cashier-facing POS, scoped to a restaurant via
// the [slug] URL segment. Auth gates require any staff role (admin/manager
// /user) *in that restaurant* — not globally.

import { notFound } from "next/navigation";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";

type Props = {
  children: React.ReactNode;
  params: { slug: string };
};

export default async function PosRestaurantLayout({ children, params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager", "user"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/pos`,
  });

  return <div className="min-h-screen w-full">{children}</div>;
}
