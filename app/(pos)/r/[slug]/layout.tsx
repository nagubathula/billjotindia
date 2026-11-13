// Full-screen shell for the cashier-facing POS, scoped to a restaurant via
// the [slug] URL segment. Auth gates require any staff role (admin/manager
// /user) *in that restaurant* — not globally.

import { notFound } from "next/navigation";
import { getCurrentUserRoles, getRestaurantBySlug, requireRole } from "@/lib/auth";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function PosRestaurantLayout(props: Props) {
  const { children } = props;
  const params = await props.params;
  // Kick off the auth/role lookups alongside the restaurant row; requireRole
  // below then resolves from the request cache.
  const [restaurant] = await Promise.all([
    getRestaurantBySlug(params.slug),
    getCurrentUserRoles(),
  ]);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager", "user"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/pos`,
  });

  return <div className="min-h-screen w-full">{children}</div>;
}
