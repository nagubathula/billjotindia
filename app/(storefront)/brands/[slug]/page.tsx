import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Store, Unplug } from "lucide-react";
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
import { getCurrentUser, getUserRestaurants } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AttachRestaurantForm } from "./AttachRestaurantForm";
import { DetachButton } from "./DetachButton";
import type { Brand, Restaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export default async function BrandPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/brands/${params.slug}`);

  const admin = createAdminClient();
  const { data: brand } = await admin
    .from("brands")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();
  if (!brand) notFound();
  if ((brand as Brand).owner_user_id !== user.id) {
    // Brand exists but user isn't the owner. Soft 404 so we don't leak
    // existence of other people's brands.
    notFound();
  }

  // Restaurants currently attached to this brand.
  const { data: attached } = await admin
    .from("restaurants")
    .select("*")
    .eq("brand_id", brand.id)
    .order("name");
  const attachedList = (attached ?? []) as Restaurant[];

  // Restaurants the user admins that AREN'T attached to any brand — these
  // are candidates for attachment via the dropdown.
  const ownRestaurants = await getUserRestaurants();
  const attachable = ownRestaurants
    .filter(({ role }) => role === "admin")
    .map(({ restaurant }) => restaurant)
    .filter((r) => r.brand_id === null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{brand.name}</h1>
        <p className="text-sm text-muted-foreground">
          Brand · <span className="font-mono">/brands/{brand.slug}</span>
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Restaurants in this brand
          </h2>
          <Badge variant="secondary">{attachedList.length}</Badge>
        </div>

        {attachedList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Store className="h-8 w-8" />
              <p>No restaurants attached yet.</p>
              <p className="text-xs">Use the form below to attach a restaurant you admin.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attachedList.map((r) => (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-1.5 text-base">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{r.name}</span>
                  </CardTitle>
                  <CardDescription className="font-mono text-[11px]">
                    /r/{r.slug}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <Link
                    href={`/r/${r.slug}/pos`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Open POS
                  </Link>
                  <DetachButton brandId={brand.id} restaurantId={r.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Attach a restaurant
        </h2>
        {attachable.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No restaurants available to attach. You can only attach
              restaurants where you are admin and which aren't in another
              brand yet.
              <div className="mt-3">
                <Link
                  href="/signup"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Create a new restaurant
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <AttachRestaurantForm
                brandId={brand.id}
                restaurants={attachable}
              />
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
