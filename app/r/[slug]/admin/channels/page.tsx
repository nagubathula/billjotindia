import { notFound } from "next/navigation";
import { Store, TriangleAlert } from "lucide-react";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createClient } from "@/lib/supabase/server";
import { CONNECTABLE_CHANNELS } from "@/lib/channels";
import { PageHeader } from "@/components/PageHeader";
import type { ChannelOutlet } from "@/lib/types";
import { ChannelCard } from "./ChannelCard";

export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

export default async function ChannelsPage({ params }: Props) {
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();
  await requireRole(["admin", "manager"], { restaurantSlug: params.slug });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);

  let links: ChannelOutlet[] = [];
  if (outletIds.length > 0) {
    const supabase = createClient();
    const { data } = await supabase
      .from("channel_outlets")
      .select("*")
      .in("outlet_id", outletIds);
    links = (data ?? []) as ChannelOutlet[];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery channels"
        description="Link each outlet to its store on a delivery platform, and switch it on or off per platform."
      />

      {/* Until an adapter for a platform is live, nothing on this page leaves billjot. */}
      <div className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">Not connected to any platform yet</p>
          <p className="mt-0.5 text-muted-foreground">
            What you set here is saved in billjot only. To really stop or start
            orders, keep using the platform&apos;s own restaurant app until the
            connection is live.
          </p>
        </div>
      </div>

      {outlets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No outlets configured.</p>
      ) : (
        outlets.map((o) => (
          <section key={o.id} className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{o.name}</span>
            </div>
            <div className="grid gap-4">
              {CONNECTABLE_CHANNELS.map((channel) => (
                <ChannelCard
                  key={channel}
                  slug={params.slug}
                  outletId={o.id}
                  channel={channel}
                  link={
                    links.find((l) => l.outlet_id === o.id && l.channel === channel) ??
                    null
                  }
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
