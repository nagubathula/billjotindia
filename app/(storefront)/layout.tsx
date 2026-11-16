import { AppNavbar } from "@/components/AppNavbar";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { getCurrentUser, getUserBrands, getUserRestaurants } from "@/lib/auth";

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

  const [restaurants, brandEntries] = await Promise.all([
    getUserRestaurants(),
    getUserBrands(),
  ]);
  const brands = brandEntries.map((b) => b.brand);

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
      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-background">
        <div className="md:hidden">
          <AppNavbar />
        </div>
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-8 sm:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
