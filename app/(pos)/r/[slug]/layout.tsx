// Full-screen shell for the cashier/captain POS and floor KDS, scoped to a
// restaurant via the [slug] URL segment. Auth gates require a POS role
// (admin, manager, cashier or captain) *in that restaurant*.

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  getCurrentUser,
  getCurrentUserRoles,
  getRestaurantBySlug,
  requireRole,
} from "@/lib/auth";
import { POS_ROLES } from "@/lib/roles";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function PosRestaurantLayout(props: Props) {
  const { children } = props;
  const params = await props.params;
  const reqHeaders = await headers();
  const currentPath =
    reqHeaders.get("x-current-path") || `/r/${params.slug}/pos`;

  // Check sign-in before RLS-scoped getRestaurantBySlug so signed-out visitors
  // are sent to sign-in (and returned to their exact page) instead of 404.
  const [signedInUser, restaurant] = await Promise.all([
    getCurrentUser(),
    getRestaurantBySlug(params.slug),
    getCurrentUserRoles(),
  ]);
  if (!signedInUser) {
    redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  }
  if (!restaurant) notFound();

  await requireRole(POS_ROLES, {
    restaurantSlug: params.slug,
    redirectTo: currentPath,
  });

  return <div className="min-h-dvh w-full">{children}</div>;
}
