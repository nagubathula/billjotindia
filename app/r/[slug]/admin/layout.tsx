import { notFound, redirect } from "next/navigation";
import { AdminSidebar } from "@/components/AdminSidebar";
import { MobileAdminNav } from "@/components/MobileAdminNav";
import {
  getCurrentUser,
  getCurrentUserRoles,
  getRestaurantBySlug,
  requireRole,
} from "@/lib/auth";

type Props = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function AdminLayout(props: Props) {
  const { children } = props;
  const params = await props.params;
  const [restaurant, signedInUser] = await Promise.all([
    getRestaurantBySlug(params.slug),
    getCurrentUser(),
    getCurrentUserRoles(),
  ]);
  // Restaurants are only readable by their staff, so a signed-out visitor
  // would otherwise see "page not found". Send them to sign in instead.
  if (!signedInUser) {
    redirect(`/login?next=${encodeURIComponent(`/r/${params.slug}/admin`)}`);
  }
  if (!restaurant) notFound();

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

  return (
    <div className="flex min-h-screen bg-background">
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
        <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
