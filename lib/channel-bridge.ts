import { createHmac } from "node:crypto";
import { after } from "next/server";
import { normalizeWebhookUrl } from "@/lib/order-webhooks";
import type { AggregatorChannel, OrderStatus } from "@/lib/types";

export type ChannelBridgeEvent =
  | {
      event: "channel.store_updated";
      channel: AggregatorChannel;
      outlet_id: string;
      external_store_id: string;
      prep_time_minutes: number;
    }
  | {
      event: "channel.store_availability_changed";
      channel: AggregatorChannel;
      outlet_id: string;
      external_store_id: string;
      is_online: boolean;
      offline_reason: string | null;
    }
  | {
      event: "channel.order_status_changed";
      channel: AggregatorChannel;
      outlet_id: string;
      external_store_id: string | null;
      order_id: string;
      external_order_id: string | null;
      status: OrderStatus;
    }
  | {
      event: "channel.order_cancelled";
      channel: AggregatorChannel;
      outlet_id: string;
      external_store_id: string | null;
      order_id: string;
      external_order_id: string | null;
      cancel_reason: string;
      cancel_note: string | null;
    };

export type ChannelStoreLookupClient = {
  from: (table: "channel_outlets") => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        eq: (col2: string, val2: string) => {
          maybeSingle: () => PromiseLike<{
            data: {
              outlet_id: string;
              external_store_id: string;
              is_online: boolean;
              offline_reason: string | null;
              prep_time_minutes: number;
            } | null;
          }>;
        };
      };
    };
  };
};

export function signChannelBridgeBody(body: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

export async function resolveChannelStoreOutlet(
  db: ChannelStoreLookupClient,
  channel: string,
  externalStoreId: string,
): Promise<{
  outletId: string;
  externalStoreId: string;
  isOnline: boolean;
  offlineReason: string | null;
  prepTimeMinutes: number;
} | null> {
  const trimmed = externalStoreId.trim();
  if (!trimmed) return null;
  const { data } = await db
    .from("channel_outlets")
    .select(
      "outlet_id, external_store_id, is_online, offline_reason, prep_time_minutes",
    )
    .eq("channel", channel)
    .eq("external_store_id", trimmed)
    .maybeSingle();
  if (!data) return null;
  return {
    outletId: data.outlet_id,
    externalStoreId: data.external_store_id,
    isOnline: Boolean(data.is_online),
    offlineReason: data.offline_reason,
    prepTimeMinutes: Number(data.prep_time_minutes ?? 15),
  };
}

/**
 * Dispatches outbound store/order events to an external delivery-platform
 * bridge worker (`CHANNEL_BRIDGE_WEBHOOK_URL`), signed with `CHANNEL_ORDER_TOKEN`.
 * Keeps partner-specific API payloads & credentials strictly out of this repo.
 */
export function dispatchChannelBridgeEvent(payload: ChannelBridgeEvent): void {
  const rawUrl = process.env.CHANNEL_BRIDGE_WEBHOOK_URL?.trim();
  if (!rawUrl) return;
  const url = normalizeWebhookUrl(rawUrl);
  if (!url) return;

  const secret = process.env.CHANNEL_ORDER_TOKEN?.trim() || "";
  const sentAt = new Date().toISOString();
  const body = JSON.stringify({
    ...payload,
    sent_at: sentAt,
  });

  const run = async () => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Billjot-ChannelBridge/1.0",
        "X-Billjot-Event": payload.event,
        "X-Billjot-Timestamp": sentAt,
      };
      if (secret) {
        headers["X-Billjot-Signature"] = signChannelBridgeBody(body, secret);
      }
      await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Never block KDS or channel admin actions on external bridge errors
    }
  };

  try {
    after(run);
  } catch {
    void run();
  }
}
