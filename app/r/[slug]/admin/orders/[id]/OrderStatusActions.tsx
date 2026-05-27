"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
  currentStatus,
}: {
  slug: string;
  orderId: number;
  currentStatus: OrderStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const nextOptions = FORWARD_NEXT[currentStatus] ?? [];
  const canCancel =
    currentStatus !== "completed" && currentStatus !== "cancelled";

  const apply = (s: OrderStatus) => {
    if (s === "cancelled" && !confirm("Cancel this order?")) return;
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
          onClick={() => apply("cancelled")}
          disabled={pending}
        >
          Cancel order
        </Button>
      )}
    </div>
  );
}
