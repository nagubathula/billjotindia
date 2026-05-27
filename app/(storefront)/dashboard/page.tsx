import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Store,
  UserCog,
  User as UserIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { getCurrentUser, getUserRestaurants } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Brand } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  user: "Cashier",
};

const ROLE_ICON: Record<AppRole, React.ComponentType<{ className?: string }>> = {
  admin: ShieldCheck,
  manager: UserCog,
  user: UserIcon,
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const restaurants = await getUserRestaurants();

  const supabase = createClient();
  const { data: brandsData } = await supabase
    .from("brands")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("name");
  const brands = (brandsData ?? []) as Brand[];

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "there";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hi, ${displayName.split(" ")[0]}`}
        description="Every restaurant and brand you have access to."
        actions={
          <Link
            href="/signup"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Plus className="mr-1 h-3 w-3" />
            New restaurant
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Restaurants"
          value={restaurants.length}
          icon={Store}
        />
        <StatCard
          label="Brands you own"
          value={brands.length}
          icon={Building2}
        />
        <StatCard
          label="Highest role"
          value={
            restaurants.some((r) => r.role === "admin")
              ? "Admin"
              : restaurants.some((r) => r.role === "manager")
                ? "Manager"
                : restaurants.length
                  ? "Cashier"
                  : "—"
          }
          icon={ShieldCheck}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Your restaurants
        </h2>

        {restaurants.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState
                icon={Store}
                title="No restaurants yet"
                description="Create your first restaurant — it becomes yours, and you become the admin."
                action={
                  <Link
                    href="/signup"
                    className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                  >
                    Create your first restaurant
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map(({ restaurant: r, role }) => {
              const RoleIcon = ROLE_ICON[role];
              const isOps = role === "admin" || role === "manager";
              return (
                <Card key={r.id} className="transition hover:border-primary/40">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <Badge
                        variant={role === "admin" ? "default" : "secondary"}
                        className="shrink-0 gap-1"
                      >
                        <RoleIcon className="h-3 w-3" />
                        {ROLE_LABEL[role]}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="font-mono text-[11px]">
                      /r/{r.slug}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Link
                      href={isOps ? `/r/${r.slug}/admin/orders` : `/r/${r.slug}/pos`}
                      className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                    >
                      {isOps ? "Open admin" : "Open POS"}
                    </Link>
                    {isOps && (
                      <Link
                        href={`/r/${r.slug}/pos`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        POS
                      </Link>
                    )}
                    <Link
                      href={`/r/${r.slug}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    >
                      Customer view ↗
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Your brands
          </h2>
          <Link
            href="/brands/new"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Plus className="mr-1 h-3 w-3" />
            Create a brand
          </Link>
        </div>

        {brands.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState
                icon={Building2}
                title="No brands yet"
                description="A brand groups multiple restaurants you operate as franchises. Useful when you run several outlets under the same banner."
                action={
                  <Link
                    href="/brands/new"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Create a brand
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((b) => (
              <Card key={b.id} className="transition hover:border-primary/40">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-base">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{b.name}</span>
                  </CardTitle>
                  <CardDescription className="font-mono text-[11px]">
                    /brands/{b.slug}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Link
                    href={`/brands/${b.slug}`}
                    className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                  >
                    Open brand
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="text-xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
