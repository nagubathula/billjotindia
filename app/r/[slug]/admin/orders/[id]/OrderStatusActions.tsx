"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  CancelOrderDialog,
  type CancelOrderLine,
} from "@/components/CancelOrderDialog";
import type { OrderStatus } from "@/lib/types";
import { updateOrderStatusAction } from "./actions";

// Forward state machine. Each status shows the button(s) for the next step(s).
const FORWARD_NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed"],
  confirmed: ["preparing"],
  preparing: ["ready"],
  ready: ["completed"],
  completed: [],
  cancelled: [],
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirm order",
  preparing: "Mark preparing",
  ready: "Mark ready",
  completed: "Mark completed",
  cancelled: "Cancel",
};

export function OrderStatusActions({
  slug,
  orderId,
  orderLabel,
  currentStatus,
  lines,
}: {
  slug: string;
  orderId: string;
  orderLabel: string;
  currentStatus: OrderStatus;
  lines: CancelOrderLine[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);

  const nextOptions = FORWARD_NEXT[currentStatus] ?? [];
  const canCancel =
    currentStatus !== "completed" && currentStatus !== "cancelled";
  // Before it's accepted the restaurant is rejecting the order; after, cancelling it.
  const verb = currentStatus === "pending" ? "reject" : "cancel";

  const apply = (s: OrderStatus) => {
    start(async () => {
      const res = await updateOrderStatusAction(slug, orderId, s);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  };

  if (nextOptions.length === 0 && !canCancel) {
    return (
      <p className="text-sm text-muted-foreground">
        This order is{" "}
        <span className="font-medium capitalize">{currentStatus}</span> — no
        further actions.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextOptions.map((s) => (
        <Button key={s} onClick={() => apply(s)} disabled={pending}>
          {STATUS_LABEL[s]} →
        </Button>
      ))}
      {canCancel && (
        <Button
          variant="destructive"
          onClick={() => setCancelOpen(true)}
          disabled={pending}
        >
          {verb === "reject" ? "Reject order" : "Cancel order"}
        </Button>
      )}
      <CancelOrderDialog
        slug={slug}
        orderId={orderId}
        orderLabel={orderLabel}
        lines={lines}
        verb={verb}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
