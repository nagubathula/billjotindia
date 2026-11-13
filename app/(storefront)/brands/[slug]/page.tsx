import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  ChefHat,
  IndianRupee,
  MapPin,
  Plus,
  ReceiptText,
  Store,
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
import { getCurrentUser, getUserRestaurants } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AttachRestaurantForm } from "./AttachRestaurantForm";
import { DetachButton } from "./DetachButton";
import type { Brand, Restaurant } from "@/lib/types";

function formatINR(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function BrandPage(props: Props) {
  const params = await props.params;
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
    notFound();
  }

  // Restaurants currently attached to this brand.
  const { data: attached } = await admin
    .from("restaurants")
    .select("*")
    .eq("brand_id", brand.id)
    .order("name");
  const attachedList = (attached ?? []) as Restaurant[];

  // Fetch outlets & today's orders across all attached restaurants for HQ roll-up
  const restIds = attachedList.map((r) => r.id);
  const { data: outletsData } = restIds.length
    ? await admin
        .from("outlets")
        .select("id, name, city, restaurant_id, status")
        .in("restaurant_id", restIds)
    : { data: [] };

  const outlets = outletsData ?? [];
  const outletIds = outlets.map((o) => o.id);
  const startOfTodayIso = new Date(
    new Date().setHours(0, 0, 0, 0),
  ).toISOString();

  const { data: todayOrdersData } = outletIds.length
    ? await admin
        .from("orders")
        .select("id, outlet_id, status, total_amount, placed_at")
        .in("outlet_id", outletIds)
        .gte("placed_at", startOfTodayIso)
    : { data: [] };

  const todayOrders = todayOrdersData ?? [];
  const outletToRest = new Map<string, string>(
    outlets.map((o) => [o.id, o.restaurant_id]),
  );

  const statsByRest = new Map<
    string,
    { outlets: number; ordersToday: number; revenueToday: number; liveQueue: number }
  >();
  for (const r of attachedList) {
    statsByRest.set(r.id, {
      outlets: outlets.filter((o) => o.restaurant_id === r.id).length,
      ordersToday: 0,
      revenueToday: 0,
      liveQueue: 0,
    });
  }

  let totalBrandRevenueToday = 0;
  let totalBrandOrdersToday = 0;
  let totalBrandLiveQueue = 0;

  for (const ord of todayOrders) {
    const rid = outletToRest.get(ord.outlet_id);
    if (!rid) continue;
    const s = statsByRest.get(rid);
    if (!s) continue;
    if (ord.status !== "cancelled") {
      s.ordersToday += 1;
      s.revenueToday += Number(ord.total_amount ?? 0);
      totalBrandOrdersToday += 1;
      totalBrandRevenueToday += Number(ord.total_amount ?? 0);
    }
    if (
      ord.status === "pending" ||
      ord.status === "confirmed" ||
      ord.status === "preparing" ||
      ord.status === "ready"
    ) {
      s.liveQueue += 1;
      totalBrandLiveQueue += 1;
    }
  }

  // Restaurants the user admins that AREN'T attached to any brand
  const ownRestaurants = await getUserRestaurants();
  const attachable = ownRestaurants
    .filter(({ role }) => role === "admin")
    .map(({ restaurant }) => restaurant)
    .filter((r) => r.brand_id === null);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{brand.name}</h1>
              <Badge variant="secondary">Franchise HQ</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Consolidated multi-restaurant operations &amp; analytics
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          ← All Workspaces
        </Link>
      </header>

      {/* Consolidated Brand Roll-Up KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-xs text-muted-foreground">Brand revenue today</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatINR(totalBrandRevenueToday)}
              </p>
            </div>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-xs text-muted-foreground">Brand orders today</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {totalBrandOrdersToday}
              </p>
            </div>
            <ReceiptText className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-xs text-muted-foreground">Franchises &amp; outlets</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {attachedList.length} <span className="text-sm font-normal text-muted-foreground">({outlets.length} outlets)</span>
              </p>
            </div>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-xs text-muted-foreground">Live kitchen queue</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {totalBrandLiveQueue}
              </p>
            </div>
            <ChefHat className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Franchise restaurants in this brand
            </h2>
            <p className="text-xs text-muted-foreground">
              Live operational roll-up across every restaurant under {brand.name}.
            </p>
          </div>
          <Badge variant="secondary">{attachedList.length} restaurants</Badge>
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
          <div className="grid gap-4 sm:grid-cols-2">
            {attachedList.map((r) => {
              const st = statsByRest.get(r.id) ?? {
                outlets: 0,
                ordersToday: 0,
                revenueToday: 0,
                liveQueue: 0,
              };
              return (
                <Card key={r.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="flex items-center gap-2.5 text-base">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-foreground">
                          <Store className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="font-semibold">{r.name}</div>
                          <div className="text-[11px] font-normal text-muted-foreground">
                            Active Franchise
                          </div>
                        </div>
                      </CardTitle>
                      <Badge variant="outline" className="shrink-0">
                        {st.outlets} {st.outlets === 1 ? "outlet" : "outlets"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
                      <div>
                        <div className="text-[11px] text-muted-foreground">Revenue today</div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums">
                          {formatINR(st.revenueToday)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Orders today</div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums">
                          {st.ordersToday}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-muted-foreground">Live KDS</div>
                        <div className="mt-0.5 text-sm font-semibold tabular-nums">
                          {st.liveQueue}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/r/${r.slug}/admin`}
                          className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                        >
                          Open admin
                        </Link>
                        <Link
                          href={`/r/${r.slug}/pos`}
                          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                        >
                          POS
                        </Link>
                        <Link
                          href={`/r/${r.slug}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                        >
                          Customer view ↗
                        </Link>
                      </div>
                      <DetachButton brandId={brand.id} restaurantId={r.id} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Attach an independent restaurant
        </h2>
        {attachable.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No independent restaurants available to attach. You can only attach
              restaurants where you are admin and which aren&apos;t in another
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
