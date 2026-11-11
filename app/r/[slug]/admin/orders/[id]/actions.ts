"use server";

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/utils";
import {
  CANCEL_NOTE_MAX,
  isCancelReason,
  type CancelOrderInput,
} from "@/lib/order-cancel";
import type { OrderStatus, ProductConfig } from "@/lib/types";

type Result = { ok: true; warning?: string } | { ok: false; error: string };
type Admin = ReturnType<typeof createAdminClient>;

// Statuses the generic action may set. Cancelling goes through
// cancelOrderAction so a reason is always recorded.
const ALLOWED_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
];

// Defence: the order must belong to an outlet in this restaurant.
async function loadOrderInRestaurant(
  admin: Admin,
  orderId: string,
  restaurantId: string,
): Promise<
  | { ok: true; order: { id: string; outlet_id: string; status: string | null } }
  | { ok: false; error: string }
> {
  if (!isUuid(orderId)) return { ok: false, error: "Order not found." };

  const { data: ord } = await admin
    .from("orders")
    .select("id, outlet_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!ord) return { ok: false, error: "Order not found." };

  const { data: out } = await admin
    .from("outlets")
    .select("restaurant_id")
    .eq("id", ord.outlet_id)
    .maybeSingle();
  if (!out || out.restaurant_id !== restaurantId) {
    return { ok: false, error: "Order doesn't belong to this restaurant." };
  }
  return { ok: true, order: ord };
}

function revalidateOrder(slug: string, orderId: string) {
  revalidatePath(`/r/${slug}/admin/orders/${orderId}`);
  revalidatePath(`/r/${slug}/admin/orders`);
  revalidatePath(`/r/${slug}/admin/kitchen`);
}

export async function updateOrderStatusAction(
  slug: string,
  orderId: string,
  newStatus: OrderStatus,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  await requireRole(["admin", "manager", "user"], { restaurantId: restaurant.id });

  if (newStatus === "cancelled") {
    return { ok: false, error: "Cancel the order with a reason instead." };
  }
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    return { ok: false, error: "Invalid status." };
  }

  const admin = createAdminClient();
  const found = await loadOrderInRestaurant(admin, orderId, restaurant.id);
  if (!found.ok) return found;

  const { error } = await admin
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(slug, orderId);
  return { ok: true };
}

// Rejects a new order or cancels one already accepted, recording why. For
// "item out of stock" it also records which products ran out and, if asked,
// takes them off the menu so the next order can't include them.
export async function cancelOrderAction(
  slug: string,
  orderId: string,
  input: CancelOrderInput,
): Promise<Result> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return { ok: false, error: "Restaurant not found." };
  const { role } = await requireRole(["admin", "manager", "user"], {
    restaurantId: restaurant.id,
  });

  if (!isCancelReason(input.reason)) {
    return { ok: false, error: "Choose a reason." };
  }
  const note = (input.note ?? "").trim().slice(0, CANCEL_NOTE_MAX);
  if (input.reason === "other" && !note) {
    return { ok: false, error: "Add a note saying why." };
  }

  const admin = createAdminClient();
  const found = await loadOrderInRestaurant(admin, orderId, restaurant.id);
  if (!found.ok) return found;
  const order = found.order;
  if (order.status === "completed" || order.status === "cancelled") {
    return { ok: false, error: `This order is already ${order.status}.` };
  }

  // Only products that are actually on this order can be named.
  let productIds: string[] = [];
  if (input.reason === "item_out_of_stock") {
    const { data: lines } = await admin
      .from("order_items")
      .select("product_config")
      .eq("order_id", orderId);
    const onOrder = new Set(
      (lines ?? [])
        .map((l) => (l.product_config as unknown as ProductConfig | null)?.product_id)
        .filter(isUuid),
    );
    productIds = [...new Set(input.productIds ?? [])].filter((id) => onOrder.has(id));
    if (onOrder.size > 0 && productIds.length === 0) {
      return { ok: false, error: "Pick the item that is out of stock." };
    }
  }

  const { error } = await admin
    .from("orders")
    .update({
      status: "cancelled",
      cancel_reason: input.reason,
      cancel_note: note || null,
      cancelled_by: "merchant",
      cancelled_at: new Date().toISOString(),
      cancel_product_ids: productIds,
    })
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidateOrder(slug, orderId);

  // Taking items off the menu is a menu change, so it needs the same role the
  // menu screen asks for.
  let warning: string | undefined;
  if (input.markOutOfStock && productIds.length > 0) {
    if (role === "user") {
      warning = "Order cancelled. Ask a manager to take the item off the menu.";
    } else {
      const { error: stockErr } = await admin
        .from("products")
        .update({ status: "inactive" })
        .eq("outlet_id", order.outlet_id)
        .in("id", productIds);
      if (stockErr) {
        warning = `Order cancelled, but the item is still on the menu: ${stockErr.message}`;
      } else {
        revalidatePath(`/r/${slug}/admin/menu`);
        revalidatePath(`/r/${slug}/pos`);
        revalidatePath(`/r/${slug}`);
      }
    }
  }

  return { ok: true, warning };
}
