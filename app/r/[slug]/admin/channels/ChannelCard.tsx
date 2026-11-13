"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Power, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_TIME_ZONE } from "@/lib/time";
import {
  CHANNEL_LABEL,
  OFFLINE_REASONS,
  offlineReasonLabel,
  type OfflineReasonCode,
} from "@/lib/channels";
import type { AggregatorChannel, ChannelOutlet } from "@/lib/types";
import { saveChannelOutletAction, setChannelOnlineAction } from "./actions";

type Status = { kind: "ok" | "err"; text: string } | null;

export function ChannelCard({
  slug,
  outletId,
  channel,
  link,
}: {
  slug: string;
  outletId: string;
  channel: AggregatorChannel;
  link: ChannelOutlet | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status>(null);
  const [choosingReason, setChoosingReason] = useState(false);
  const [reason, setReason] = useState<OfflineReasonCode>(OFFLINE_REASONS[0].code);

  const name = CHANNEL_LABEL[channel];
  const fieldId = `${channel}-${outletId}`;

  function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setStatus(null);
    start(async () => {
      const res = await task();
      if (res.ok) {
        setStatus({ kind: "ok", text: done });
        setChoosingReason(false);
        router.refresh();
      } else {
        setStatus({ kind: "err", text: res.error });
      }
    });
  }

  const offlineSince = link?.offline_since
    ? new Date(link.offline_since).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: DEFAULT_TIME_ZONE,
      })
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{name}</CardTitle>
          {!link ? (
            <Badge variant="outline">Not linked</Badge>
          ) : link.is_online ? (
            <Badge className="bg-emerald-500/10 text-emerald-700">Accepting orders</Badge>
          ) : (
            <Badge variant="destructive">Offline</Badge>
          )}
        </div>
        <CardDescription>
          {!link
            ? `Enter the store ID ${name} gave this outlet.`
            : link.is_online
              ? `Marked as taking ${name} orders.`
              : `${offlineReasonLabel(link.offline_reason) ?? "Switched off"}${
                  offlineSince ? ` · since ${offlineSince}` : ""
                }`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form
          action={(fd) =>
            run(
              () => saveChannelOutletAction(slug, outletId, channel, fd),
              link ? "Saved." : "Store linked.",
            )
          }
          className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-store`}>{name} store ID</Label>
            <Input
              id={`${fieldId}-store`}
              name="external_store_id"
              defaultValue={link?.external_store_id ?? ""}
              maxLength={64}
              required
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-prep`}>Prep time (min)</Label>
            <Input
              id={`${fieldId}-prep`}
              name="prep_time_minutes"
              type="number"
              min={1}
              max={180}
              defaultValue={link?.prep_time_minutes ?? 15}
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={pending}>
            <Save className="mr-1 h-3 w-3" />
            {link ? "Save" : "Link store"}
          </Button>
        </form>

        {link && (
          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            {link.is_online && !choosingReason && (
              <Button
                variant="destructive"
                onClick={() => setChoosingReason(true)}
                disabled={pending}
              >
                <Power className="mr-1 h-3 w-3" />
                Go offline on {name}
              </Button>
            )}

            {link.is_online && choosingReason && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={`${fieldId}-reason`}>Why?</Label>
                  <select
                    id={`${fieldId}-reason`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value as OfflineReasonCode)}
                    disabled={pending}
                    className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {OFFLINE_REASONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => setChannelOnlineAction(slug, outletId, channel, false, reason),
                      "Marked offline.",
                    )
                  }
                >
                  Go offline
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => setChoosingReason(false)}
                >
                  Stay online
                </Button>
              </>
            )}

            {!link.is_online && (
              <Button
                disabled={pending}
                onClick={() =>
                  run(
                    () => setChannelOnlineAction(slug, outletId, channel, true),
                    "Marked online.",
                  )
                }
              >
                <Power className="mr-1 h-3 w-3" />
                Go online on {name}
              </Button>
            )}
          </div>
        )}

        {status && (
          <p
            className={`text-sm ${
              status.kind === "ok" ? "text-emerald-700" : "text-destructive"
            }`}
            role={status.kind === "err" ? "alert" : undefined}
          >
            {status.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
