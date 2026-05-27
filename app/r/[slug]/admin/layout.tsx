// Sidebar shell for the admin sections. Persistent left rail with the
// active item highlighted; content area on the right gets its own header
// (via <PageHeader/>) per route.
//
// Role gate: admin OR manager. /admin/users tightens further to admin only.

import { notFound } from "next/navigation";
import { AdminSidebar } from "@/components/AdminSidebar";
import { MobileAdminNav } from "@/components/MobileAdminNav";
import {
  getCurrentUser,
  getRestaurantBySlug,
  getRoleInRestaurant,
  requireRole,
} from "@/lib/auth";
import type { AppRole } from "@/lib/types";

type Props = {
  children: React.ReactNode;
  params: { slug: string };
};

export default async function AdminLayout({ children, params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();

  await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/orders`,
  });

  // For the sidebar we also need the user's identity + role to render the
  // 'who am I' card. requireRole only returns user/role/restaurant, so we
  // re-use those values rather than re-querying.
  const user = await getCurrentUser();
  const role = (await getRoleInRestaurant(restaurant.id)) as AppRole;
  const userName =
    (user?.user_metadata?.display_name as string | undefined) ??
    (user?.user_metadata?.full_name as string | undefined) ??
    user?.email ??
    "Staff";
  const userEmail = user?.email ?? "";

  // We can't infer the active nav item from the URL in a layout (params don't
  // include the rest of the path), so the page itself sets a class on
  // <body data-admin-section="orders"> via a small script — or, simpler, we
  // pass active through a global mobile nav and let each page mark its own
  // sidebar item active via aria attribute. Since the active item is mostly
  // cosmetic, render the sidebar without a hard 'active' and let the
  // [active item resolution] live in the page-level imports below.
  return (
    <div className="flex min-h-screen bg-muted/30">
      <AdminSidebar
        restaurant={restaurant}
        role={role}
        userEmail={userEmail}
        userName={userName}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <MobileAdminNav
          restaurant={restaurant}
          role={role}
          userEmail={userEmail}
          userName={userName}
        />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
