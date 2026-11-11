// Sidebar shell for the admin sections. Persistent left rail with the
// active item highlighted; content area on the right gets its own header
// (via <PageHeader/>) per route.
//
// Role gate: admin OR manager. /admin/users tightens further to admin only.

import { notFound } from "next/navigation";
import { AdminSidebar } from "@/components/AdminSidebar";
import { MobileAdminNav } from "@/components/MobileAdminNav";
import {
  getCurrentUserRoles,
  getRestaurantBySlug,
  requireRole,
} from "@/lib/auth";

type Props = {
  children: React.ReactNode;
  params: { slug: string };
};

export default async function AdminLayout({ children, params }: Props) {
  // Start the auth/role lookups alongside the restaurant row; requireRole then
  // resolves entirely from the request cache.
  const [restaurant] = await Promise.all([
    getRestaurantBySlug(params.slug),
    getCurrentUserRoles(),
  ]);
  if (!restaurant) notFound();

  // The sidebar's 'who am I' card uses the user + role requireRole returns.
  const { user, role } = await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: `/r/${params.slug}/admin/orders`,
  });
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
