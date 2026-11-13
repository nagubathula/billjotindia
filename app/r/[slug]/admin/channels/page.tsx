import { notFound } from "next/navigation";
import { Store, Info } from "lucide-react";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { getOutletsForRestaurant } from "@/lib/outlet-context";
import { createClient } from "@/lib/supabase/server";
import { CONNECTABLE_CHANNELS } from "@/lib/channels";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import type { ChannelOutlet } from "@/lib/types";
import { ChannelCard } from "./ChannelCard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function ChannelsPage(props: Props) {
  const params = await props.params;
  const restaurant = await getRestaurantBySlug(params.slug);
  if (!restaurant) notFound();
  await requireRole(["admin", "manager"], { restaurantSlug: params.slug });

  const outlets = await getOutletsForRestaurant(restaurant.id);
  const outletIds = outlets.map((o) => o.id);

  let links: ChannelOutlet[] = [];
  if (outletIds.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("channel_outlets")
      .select("*")
      .in("outlet_id", outletIds);
    links = (data ?? []) as ChannelOutlet[];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Delivery Channels"
        description="Link each outlet to its aggregator store IDs (Zomato, Swiggy) and manage prep times and availability."
      />

      <div className="flex items-start gap-2.5 rounded-xl bg-muted/60 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
        <span>
          Store IDs and prep-time settings are saved in Billjot and used to route incoming webhook orders to the matching outlet.
        </span>
      </div>

      {outlets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No outlets configured.</p>
      ) : (
        <div className="space-y-8">
          {outlets.map((o) => {
            const outletLinks = links.filter((l) => l.outlet_id === o.id);
            const onlineCount = outletLinks.filter((l) => l.is_online).length;
            return (
              <section key={o.id} className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{o.name}</span>
                    {o.city && (
                      <span className="text-xs text-muted-foreground">· {o.city}</span>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs font-normal">
                    {onlineCount} / {CONNECTABLE_CHANNELS.length} online
                  </Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {CONNECTABLE_CHANNELS.map((channel) => (
                    <ChannelCard
                      key={channel}
                      slug={params.slug}
                      outletId={o.id}
                      channel={channel}
                      link={
                        outletLinks.find((l) => l.channel === channel) ?? null
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
