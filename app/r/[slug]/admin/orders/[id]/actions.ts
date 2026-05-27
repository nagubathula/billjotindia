"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderStatus } from "@/lib/types";

type Result = { ok: true } | { ok: false; error: string };

const ALLOWED_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

export async function updateOrderStatusAction(
  slug: string,
  orderId: number,
  newStatus: OrderStatus,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager", "user"], { restaurantId: restaurant.id });

  if (!ALLOWED_STATUSES.includes(newStatus)) {
    return { ok: false, error: "Invalid status." };
  }

  const admin = createAdminClient();

  // Defence: order must belong to an outlet in this restaurant.
  const { data: ord } = await admin
    .from("orders")
    .select("id, outlet_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!ord) return { ok: false, error: "Order not found." };

  const { data: out } = await admin
    .from("outlets")
    .select("restaurant_id")
    .eq("id", ord.outlet_id)
    .maybeSingle();
  if (!out || out.restaurant_id !== restaurant.id) {
    return { ok: false, error: "Order doesn't belong to this restaurant." };
  }

  const { error } = await admin
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/r/${slug}/admin/orders/${orderId}`);
  revalidatePath(`/r/${slug}/admin/orders`);
  return { ok: true };
}
