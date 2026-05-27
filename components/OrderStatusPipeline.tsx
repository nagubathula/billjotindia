// Horizontal pipeline rendering the order lifecycle. Done steps show a
// check, the current step is highlighted in primary, future steps muted.
// If the order is cancelled, we collapse to a single destructive pill.

import { AlertOctagon, Check } from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FLOW: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "completed",
];

const LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function OrderStatusPipeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <AlertOctagon className="h-4 w-4" />
        Cancelled — no further actions.
      </div>
    );
  }

  const currentIdx = FLOW.indexOf(status);

  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {FLOW.map((s, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <li key={s} className="flex items-center gap-1">
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                isPast &&
                  "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
                isCurrent && "border-primary bg-primary text-primary-foreground",
                !isPast &&
                  !isCurrent &&
                  "border-border bg-background text-muted-foreground",
              )}
            >
              {isPast ? (
                <Check className="h-3 w-3" />
              ) : (
                <span
                  className={cn(
                    "flex h-3 w-3 items-center justify-center rounded-full text-[9px] font-semibold",
                    isCurrent
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
              )}
              <span className={cn(isCurrent && "font-semibold")}>
                {LABEL[s]}
              </span>
            </div>
            {i < FLOW.length - 1 && (
              <span
                className={cn(
                  "h-px w-3",
                  isPast ? "bg-emerald-300 dark:bg-emerald-800" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
