"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Plus, TriangleAlert } from "lucide-react";
import type { ApiKeyScope } from "@/lib/api-keys";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  outlet: string | null;
  scopes: ApiKeyScope[];
  created: string;
  lastUsed: string | null;
  revoked: string | null;
};

// Kept here rather than imported: lib/api-keys is server-only.
const SCOPES: { id: ApiKeyScope; label: string; hint: string }[] = [
  {
    id: "menu:read",
    label: "Read menu",
    hint: "Store details, outlets, categories, items, prices and add-ons.",
  },
  {
    id: "orders:write",
    label: "Place orders",
    hint: "Send web or kiosk orders and check their status. Prices are always recalculated from your menu.",
  },
];

const ALL_OUTLETS = "all";

export function ApiKeysManager({
  slug,
  apiBase,
  outlets,
  keys,
  loadError,
}: {
  slug: string;
  apiBase: string;
  outlets: { id: string; name: string }[];
  keys: ApiKeyRow[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [outletId, setOutletId] = useState<string>(ALL_OUTLETS);
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["menu:read", "orders:write"]);
  const [createError, setCreateError] = useState<string | null>(null);

  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeKeys = keys.filter((k) => !k.revoked);

  function openCreate() {
    setName("");
    setOutletId(ALL_OUTLETS);
    setScopes(["menu:read", "orders:write"]);
    setCreateError(null);
    setCreateOpen(true);
  }

  function toggleScope(scope: ApiKeyScope, on: boolean) {
    setScopes((cur) => (on ? [...new Set([...cur, scope])] : cur.filter((s) => s !== scope)));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    startTransition(async () => {
      const res = await createApiKeyAction(slug, {
        name,
        outletId: outletId === ALL_OUTLETS ? null : outletId,
        scopes,
      });
      if (!res.ok) return setCreateError(res.error);
      setCreateOpen(false);
      setNewKey({ name: name.trim(), key: res.key });
      router.refresh();
    });
  }

  function handleRevoke() {
    if (!revoking) return;
    const target = revoking;
    startTransition(async () => {
      const res = await revokeApiKeyAction(slug, target.id);
      setRevoking(null);
      if (!res.ok) return setError(res.error);
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API keys"
        description="Connect your own websites and apps to this restaurant's menu and orders."
        actions={
          <Button size="sm" onClick={openCreate} disabled={Boolean(loadError)}>
            <Plus /> New API key
          </Button>
        }
      />

      {(loadError || error) && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive"
        >
          {loadError ?? error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Keys</CardTitle>
          <CardDescription>
            Create one key per website or app, so you can switch one off without
            affecting the others.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              description="A key lets a website or app you build read your menu and send orders to your kitchen."
              action={
                !loadError && (
                  <Button size="sm" onClick={openCreate}>
                    <Plus /> New API key
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Name</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Can</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => (
                    <TableRow key={k.id} className={cn(k.revoked && "text-muted-foreground")}>
                      <TableCell>
                        <div className="font-medium text-foreground">{k.name}</div>
                        <div className="text-xs text-muted-foreground">Created {k.created}</div>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                          {k.prefix}…
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <Badge key={s} variant="secondary">
                              {SCOPES.find((x) => x.id === s)?.label ?? s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{k.outlet ?? "All outlets"}</TableCell>
                      <TableCell className="text-xs">{k.lastUsed ?? "Never"}</TableCell>
                      <TableCell className="text-right">
                        {k.revoked ? (
                          <Badge variant="outline">Revoked {k.revoked}</Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setRevoking(k)}
                          >
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Using a key</CardTitle>
          <CardDescription>
            Send the key with every request, from your website&apos;s server. Anyone
            who sees a key can use it until you revoke it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <CopyField label="API address" value={apiBase} />
            <CopyField label="Header" value="Authorization: Bearer <your key>" />
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Request</TableHead>
                  <TableHead>What it does</TableHead>
                  <TableHead>Needs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <EndpointRow
                  method="GET"
                  path="/api/menu"
                  what="Your restaurant, its outlets and the live menu with add-ons. Add ?outlet_id= to pick an outlet."
                  needs="Read menu"
                />
                <EndpointRow
                  method="POST"
                  path="/api/orders"
                  what="Place a web or kiosk order. It goes straight to the kitchen board, priced from your menu."
                  needs="Place orders"
                />
                <EndpointRow
                  method="GET"
                  path="/api/orders/{id}"
                  what="An order's status and items, for an order-tracking page."
                  needs="Place orders"
                />
              </TableBody>
            </Table>
          </div>

          <pre className="overflow-x-auto rounded-lg bg-muted px-4 py-3 font-mono text-xs leading-relaxed">
            {`curl ${apiBase}/menu \\\n  -H "Authorization: Bearer <your key>"`}
          </pre>
        </CardContent>
      </Card>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>
              Name it after the website or app that will use it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-5">
            <div className="grid gap-1.5">
              <Label htmlFor="key-name" className="text-xs">
                Name
              </Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Main website"
                maxLength={80}
                required
                autoFocus
              />
            </div>

            {outlets.length > 1 && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Outlet</Label>
                <Select value={outletId} onValueChange={(v) => v && setOutletId(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OUTLETS}>All outlets</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-xs font-medium">This key can</legend>
              {SCOPES.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(s.id)}
                    onChange={(e) => toggleScope(s.id, e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {createError && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
                {createError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim() || scopes.length === 0}>
                {pending ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Show the new key once */}
      <Dialog
        open={newKey !== null}
        onOpenChange={(o) => !o && setNewKey(null)}
        disablePointerDismissal
      >
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Copy your new key</DialogTitle>
            <DialogDescription>
              {newKey?.name}: this is the only time the full key is shown. Store it
              in your website&apos;s server settings, not in its public code.
            </DialogDescription>
          </DialogHeader>
          {newKey && <CopyField label="API key" value={newKey.key} large />}
          <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            If you lose it, revoke it and create a new one.
          </p>
          <DialogFooter>
            <Button onClick={() => setNewKey(null)}>I&apos;ve copied it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke */}
      <Dialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke &ldquo;{revoking?.name}&rdquo;?</DialogTitle>
            <DialogDescription>
              Anything using this key stops working straight away. This can&apos;t
              be undone.
              {activeKeys.length === 1 && " It's your only active key."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={pending}>
              {pending ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EndpointRow({
  method,
  path,
  what,
  needs,
}: {
  method: "GET" | "POST";
  path: string;
  what: string;
  needs: string;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="align-top">
        <span className="inline-flex items-center gap-2 font-mono text-xs">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-semibold",
              method === "GET"
                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            )}
          >
            {method}
          </span>
          {path}
        </span>
      </TableCell>
      <TableCell className="text-xs whitespace-normal text-muted-foreground">{what}</TableCell>
      <TableCell className="align-top text-xs">{needs}</TableCell>
    </TableRow>
  );
}

function CopyField({ label, value, large }: { label: string; value: string; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the value stays selectable on screen.
    }
  }
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 py-1.5 pr-1.5 pl-3">
        <code
          className={cn(
            "min-w-0 flex-1 truncate font-mono select-all",
            large ? "text-sm" : "text-xs",
          )}
        >
          {value}
        </code>
        <Button type="button" variant="outline" size="xs" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="text-emerald-600" /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
