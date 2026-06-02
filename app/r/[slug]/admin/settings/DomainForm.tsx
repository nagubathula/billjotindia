"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Save } from "lucide-react";
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
import { updateCustomDomainAction } from "./actions";

export function DomainForm({
  slug,
  currentDomain,
  subdomainHost,
}: {
  slug: string;
  currentDomain: string | null;
  /** e.g. "cafemocha.billjot.app", or null when subdomain routing is off. */
  subdomainHost: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<
    { kind: "ok"; text: string } | { kind: "err"; text: string } | null
  >(null);

  return (
    <form
      action={(fd) => {
        setStatus(null);
        start(async () => {
          const res = await updateCustomDomainAction(slug, fd);
          if (res.ok) {
            setStatus({ kind: "ok", text: "Domain saved. DNS changes can take a few minutes to take effect." });
            router.refresh();
          } else {
            setStatus({ kind: "err", text: res.error });
          }
        });
      }}
      className="space-y-4"
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-muted-foreground" />
            Storefront domain
          </CardTitle>
          <CardDescription>
            Where your customers reach your online store. Your data is always
            isolated — visitors on any of these only ever see this restaurant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subdomainHost && (
            <div className="grid gap-1.5">
              <Label>Free subdomain</Label>
              <Input
                value={`https://${subdomainHost}`}
                readOnly
                disabled
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Always available — no setup needed.
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="custom_domain">Your own domain (optional)</Label>
            <Input
              id="custom_domain"
              name="custom_domain"
              type="text"
              defaultValue={currentDomain ?? ""}
              placeholder="order.yourcafe.com"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Point a <span className="font-mono">CNAME</span> record for this
              domain at your app host, then enter it here. Leave blank to remove
              a custom domain.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
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
        <Button type="submit" disabled={pending}>
          <Save className="mr-1 h-3 w-3" />
          {pending ? "Saving…" : "Save domain"}
        </Button>
      </div>
    </form>
  );
}
