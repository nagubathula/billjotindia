import { AppNavbar } from "@/components/AppNavbar";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { getCurrentUser, getUserRestaurants } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <>
        <AppNavbar />
        <main className="mx-auto max-w-5xl px-5 py-10">{children}</main>
      </>
    );
  }

  const [restaurants, supabase] = await Promise.all([
    getUserRestaurants(),
    createClient(),
  ]);

  const { data: brandsData } = await supabase
    .from("brands")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("name");
  const brands = (brandsData ?? []) as Brand[];

  const userName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Admin";
  const userEmail = user.email ?? "";

  return (
    <div className="flex min-h-screen bg-background">
      <WorkspaceSidebar
        restaurants={restaurants}
        brands={brands}
        userName={userName}
        userEmail={userEmail}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <div className="md:hidden">
          <AppNavbar />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
