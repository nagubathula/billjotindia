import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  MonitorSmartphone,
  Plus,
  ShieldCheck,
  Store,
  UserCog,
  User as UserIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
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

function formatHandle(slug: string, fallbackName: string): string {
  // Hide raw 36-char UUID slugs in the UI and show a clean readable handle
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(slug)) {
    return fallbackName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  return slug;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  const restaurants = await getUserRestaurants();

  const supabase = await createClient();
  const { data: brandsData } = await supabase
    .from("brands")
    .select("*")
    .eq("owner_user_id", user.id)
    .order("name");
  const brands = (brandsData ?? []) as Brand[];
  const brandById = new Map<string, Brand>(brands.map((b) => [b.id, b]));
  const countByBrandId = new Map<string, number>();
  for (const { restaurant: r } of restaurants) {
    if (r.brand_id) {
      countByBrandId.set(r.brand_id, (countByBrandId.get(r.brand_id) ?? 0) + 1);
    }
  }

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "there";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${displayName.split(" ")[0]}`}
        description="Manage your restaurants, franchise brands, and point-of-sale terminals."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/brands/new"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              New brand
            </Link>
            <Link
              href="/signup"
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              <Plus className="h-3.5 w-3.5" />
              New restaurant
            </Link>
          </div>
        }
      />

      {/* Summary KPI Strip */}
      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Active Restaurants"
          value={restaurants.length}
          sub="Operational POS & Storefront"
          icon={Store}
        />
        <StatCard
          label="Franchise Brands"
          value={brands.length}
          sub="Multi-restaurant groups"
          icon={Building2}
        />
        <StatCard
          label="Access Level"
          value={
            restaurants.some((r) => r.role === "admin")
              ? "Admin"
              : restaurants.some((r) => r.role === "manager")
                ? "Manager"
                : restaurants.length
                  ? "Cashier"
                  : "—"
          }
          sub="Full workspace permissions"
          icon={ShieldCheck}
        />
      </section>

      {/* Restaurants Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Restaurants
            </h2>
            <p className="text-xs text-muted-foreground">
              Launch admin portals, counter POS billing, or online storefronts.
            </p>
          </div>
        </div>

        {restaurants.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Store}
                title="No restaurants yet"
                description="Create your first restaurant — it becomes yours, and you become the admin."
                action={
                  <Link
                    href="/signup"
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" }),
                    )}
                  >
                    Create your first restaurant
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map(({ restaurant: r, role }) => {
              const RoleIcon = ROLE_ICON[role];
              const isOps = role === "admin" || role === "manager";
              const parentBrand = r.brand_id
                ? brandById.get(r.brand_id)
                : undefined;

              return (
                <Card key={r.id} className="justify-between">
                  <CardHeader className="space-y-2.5 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
                        <Store className="h-4 w-4" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        {parentBrand ? (
                          <Badge variant="outline" className="text-[11px]">
                            {parentBrand.name}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px]">
                            Independent
                          </Badge>
                        )}
                        <Badge variant="secondary" className="gap-1 text-[11px]">
                          <RoleIcon className="h-3 w-3" />
                          {ROLE_LABEL[role]}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <CardTitle className="text-base font-semibold leading-snug">
                        {r.name}
                      </CardTitle>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        /{formatHandle(r.slug, r.name)}
                      </p>
                    </div>
                  </CardHeader>

                  <CardFooter className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={
                          isOps ? `/r/${r.slug}/admin` : `/r/${r.slug}/pos`
                        }
                        className={cn(
                          buttonVariants({ variant: "default", size: "sm" }),
                        )}
                      >
                        {isOps ? "Admin Portal" : "Open POS"}
                      </Link>
                      {isOps && (
                        <Link
                          href={`/r/${r.slug}/pos`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                          )}
                        >
                          <MonitorSmartphone className="h-3.5 w-3.5" />
                          POS
                        </Link>
                      )}
                    </div>
                    <Link
                      href={`/r/${r.slug}`}
                      target="_blank"
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Storefront
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Brands Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Franchise Brands
            </h2>
            <p className="text-xs text-muted-foreground">
              Consolidated roll-up analytics across multi-restaurant brands.
            </p>
          </div>
        </div>

        {brands.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Building2}
                title="No brands yet"
                description="A brand groups multiple restaurants you operate as franchises."
                action={
                  <Link
                    href="/brands/new"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                    )}
                  >
                    Create a brand
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((b) => {
              const count = countByBrandId.get(b.id) ?? 0;
              return (
                <Card key={b.id} className="justify-between">
                  <CardHeader className="space-y-2.5 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <Badge variant="secondary">
                        {count} {count === 1 ? "restaurant" : "restaurants"}
                      </Badge>
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold leading-snug">
                        {b.name}
                      </CardTitle>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        /brands/{formatHandle(b.slug, b.name)}
                      </p>
                    </div>
                  </CardHeader>
                  <CardFooter className="flex items-center justify-between">
                    <Link
                      href={`/brands/${b.slug}`}
                      className={cn(
                        buttonVariants({ variant: "default", size: "sm" }),
                      )}
                    >
                      Open Brand HQ
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums">
            {value}
          </p>
          <p className="text-[11px] text-muted-foreground">{sub}</p>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
