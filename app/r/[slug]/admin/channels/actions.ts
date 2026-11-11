"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CONNECTABLE_CHANNELS, OFFLINE_REASONS } from "@/lib/channels";
import { isUuid } from "@/lib/utils";
import type { AggregatorChannel } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

// These actions only record what the restaurant wants. Telling the platform
// (store on/off, prep time) is the channel adapter's job once one exists.

async function authorise(
  slug: string,
  outletId: string,
  channel: string,
): Promise<
  | { ok: true; admin: ReturnType<typeof createAdminClient>; channel: AggregatorChannel }
  | { ok: false; error: string }
> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager"], { restaurantId: restaurant.id });

  if (!(CONNECTABLE_CHANNELS as string[]).includes(channel)) {
    return { ok: false, error: "Unknown channel." };
  }
  if (!isUuid(outletId)) return { ok: false, error: "Outlet not found." };

  // Defence: outlet must belong to this restaurant.
  const admin = createAdminClient();
  const { data: outlet } = await admin
    .from("outlets")
    .select("id, restaurant_id")
    .eq("id", outletId)
    .maybeSingle();
  if (!outlet || outlet.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Outlet not in this restaurant." };
  }
  return { ok: true, admin, channel: channel as AggregatorChannel };
}

/** Links an outlet to its store on a platform, or updates the link. */
export async function saveChannelOutletAction(
  slug: string,
  outletId: string,
  channel: string,
  formData: FormData,
): Promise<Result> {
  const auth = await authorise(slug, outletId, channel);
  if (!auth.ok) return auth;

  const storeId = String(formData.get("external_store_id") ?? "").trim();
  if (!storeId) return { ok: false, error: "Enter the store ID." };
  if (storeId.length > 64 || /\s/.test(storeId)) {
    return { ok: false, error: "A store ID has no spaces and at most 64 characters." };
  }

  const prep = Number(formData.get("prep_time_minutes"));
  if (!Number.isInteger(prep) || prep < 1 || prep > 180) {
    return { ok: false, error: "Prep time must be between 1 and 180 minutes." };
  }

  const { error } = await auth.admin.from("channel_outlets").upsert(
    {
      outlet_id: outletId,
      channel: auth.channel,
      external_store_id: storeId,
      prep_time_minutes: prep,
    },
    { onConflict: "outlet_id,channel" },
  );
  if (error) {
    // 23505 = unique_violation on (channel, external_store_id).
    if (error.code === "23505") {
      return { ok: false, error: "That store ID is already linked to another outlet." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/r/${slug}/admin/channels`);
  return { ok: true };
}

/** Switches an outlet on or off for one platform. Going offline needs a reason. */
export async function setChannelOnlineAction(
  slug: string,
  outletId: string,
  channel: string,
  online: boolean,
  reason?: string,
): Promise<Result> {
  const auth = await authorise(slug, outletId, channel);
  if (!auth.ok) return auth;

  if (!online && !OFFLINE_REASONS.some((r) => r.code === reason)) {
    return { ok: false, error: "Choose why the outlet is going offline." };
  }

  const { data, error } = await auth.admin
    .from("channel_outlets")
    .update({
      is_online: online,
      offline_reason: online ? null : (reason ?? null),
      offline_since: online ? null : new Date().toISOString(),
    })
    .eq("outlet_id", outletId)
    .eq("channel", auth.channel)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Link the store first." };

  revalidatePath(`/r/${slug}/admin/channels`);
  return { ok: true };
}
