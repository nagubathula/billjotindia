import { createHmac, randomBytes } from "node:crypto";
import { after } from "next/server";
import { createClient as createAnonSupabase } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

export type OrderWebhookEvent =
  | "order.created"
  | "order.updated"
  | "order.completed"
  | "order.cancelled";

export type TrackedOrderPayload = {
  id: string;
  unique_order_id: string | null;
  token_number: number | null;
  status: string | null;
  order_type: string | null;
  source: string;
  customer_name: string;
  subtotal: number;
  total_amount: number;
  payment_status: string | null;
  payment_provider: string | null;
  placed_at: string;
  updated_at: string | null;
  outlet_id: string;
  table_id: string | null;
  items: {
    product_id: string | null;
    name: string;
    quantity: number;
    total_price: number;
    options: string[];
    instructions: string | null;
  }[];
};

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signOrderWebhookBody(body: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

/**
 * Validates a customer-configured outgoing webhook URL.
 * Rejects non-HTTP(S) schemes and private/metadata IPs in production to prevent SSRF.
 */
export function normalizeWebhookUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local");
    const isHostedProd =
      process.env.VERCEL_ENV === "production" ||
      (Boolean(process.env.VERCEL) && process.env.NODE_ENV === "production");
    if (isHostedProd) {
      if (u.protocol !== "https:" || isLocal) return null;
      if (
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      ) {
        return null;
      }
    }
    return u.toString();
  } catch {
    return null;
  }
}

export async function loadTrackedOrderWithOutlet(orderId: string): Promise<{
  order: TrackedOrderPayload;
  outlet: { id: string; restaurant_id: string };
} | null> {
  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, unique_order_id, token_number, status, order_type, source, customer_name, subtotal, total_amount, payment_status, payment_provider, placed_at, updated_at, outlet_id, table_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const [{ data: outlet }, { data: items }] = await Promise.all([
    supabase
      .from("outlets")
      .select("id, restaurant_id")
      .eq("id", order.outlet_id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("quantity, total_price, instructions, product_config")
      .eq("order_id", order.id),
  ]);
  if (!outlet) return null;

  return {
    outlet,
    order: {
      id: order.id,
      unique_order_id: order.unique_order_id,
      token_number: order.token_number,
      status: order.status,
      order_type: order.order_type,
      source: order.source,
      customer_name: order.customer_name,
      subtotal: Number(order.subtotal ?? 0),
      total_amount: Number(order.total_amount ?? 0),
      payment_status: order.payment_status,
      payment_provider: order.payment_provider,
      placed_at: order.placed_at,
      updated_at: order.updated_at,
      outlet_id: order.outlet_id,
      table_id: order.table_id,
      items: (items ?? []).map((it) => {
        const cfg = (it.product_config ?? {}) as {
          product_id?: string;
          name?: string;
          selected_options?: { option_name?: string }[];
        };
        return {
          product_id: cfg.product_id ?? null,
          name: cfg.name ?? "Item",
          quantity: Number(it.quantity),
          total_price: Number(it.total_price),
          options: (cfg.selected_options ?? [])
            .map((o) => o.option_name)
            .filter((v): v is string => Boolean(v)),
          instructions: it.instructions,
        };
      }),
    },
  };
}

/**
 * Fires non-blocking signed HTTP POST callbacks to every active API key on the
 * restaurant (that covers this outlet) with a configured `webhook_url`.
 * Uses Next.js `after()` when inside a request/action scope so Vercel serverless
 * functions keep running until webhook delivery finishes.
 */
export function dispatchOrderStatusWebhooks(
  orderId: string,
  explicitEvent?: OrderWebhookEvent,
): void {
  const run = async () => {
    try {
      const loaded = await loadTrackedOrderWithOutlet(orderId);
      if (!loaded) return;

      const supabase = createAdminClient();
      const { data: keys } = await supabase
        .from("restaurant_api_keys")
        .select("id, outlet_id, webhook_url, webhook_secret")
        .eq("restaurant_id", loaded.outlet.restaurant_id)
        .is("revoked_at", null)
        .not("webhook_url", "is", null);

      const targets = (keys ?? []).filter(
        (k) =>
          Boolean(k.webhook_url?.trim()) &&
          (k.outlet_id === null || k.outlet_id === loaded.outlet.id),
      );
      if (targets.length === 0) return;

      const event: OrderWebhookEvent =
        explicitEvent ??
        (loaded.order.status === "completed"
          ? "order.completed"
          : loaded.order.status === "cancelled"
            ? "order.cancelled"
            : "order.updated");

      const timestamp = new Date().toISOString();
      const body = JSON.stringify({
        event,
        sent_at: timestamp,
        order: loaded.order,
      });

      await Promise.allSettled(
        targets.map(async (k) => {
          const url = normalizeWebhookUrl(k.webhook_url);
          if (!url) return;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "Billjot-Webhooks/1.2",
            "X-Billjot-Event": event,
            "X-Billjot-Timestamp": timestamp,
          };
          if (k.webhook_secret) {
            headers["X-Billjot-Signature"] = signOrderWebhookBody(
              body,
              k.webhook_secret,
            );
          }
          await fetch(url, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(5000),
          });
        }),
      );
    } catch {
      // Webhook delivery failures must never break POS or KDS actions
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}

export function createRealtimeServiceSubscriber() {
  return createAnonSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
