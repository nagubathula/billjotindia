import { headers } from "next/headers";
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
  const [restaurant, signedInUser, reqHeaders] = await Promise.all([
    getRestaurantBySlug(params.slug),
    getCurrentUser(),
    headers(),
    getCurrentUserRoles(),
  ]);
  const currentPath =
    reqHeaders.get("x-current-path") || `/r/${params.slug}/admin`;
  // Restaurants are only readable by their staff, so a signed-out visitor
  // would otherwise see "page not found". Send them to sign in and return to
  // the exact admin sub-page they requested.
  if (!signedInUser) {
    redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  }
  if (!restaurant) notFound();

  const { user, role } = await requireRole(["admin", "manager"], {
    restaurantSlug: params.slug,
    redirectTo: currentPath,
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
      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-zinc-50/55 dark:bg-background">
        <MobileAdminNav
          restaurant={restaurant}
          role={role}
          userEmail={userEmail}
          userName={userName}
        />
        <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-8 sm:py-7">
          {children}
        </div>
      </div>
    </div>
  );
}
