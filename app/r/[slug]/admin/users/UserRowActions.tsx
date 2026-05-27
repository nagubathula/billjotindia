"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/types";
import {
  resetPasswordAction,
  revokeUserAction,
  setUserRoleAction,
} from "./actions";

export function UserRowActions({
  userId,
  userEmail,
  restaurantId,
  currentRole,
  isSelf,
}: {
  userId: string;
  userEmail: string;
  restaurantId: number;
  currentRole: AppRole | null;
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetResult, setResetResult] = useState<
    { kind: "ok"; password: string } | { kind: "err"; text: string } | null
  >(null);

  const setRole = (role: AppRole) => {
    start(async () => {
      const fd = new FormData();
      fd.set("user_id", userId);
      fd.set("role", role);
      fd.set("restaurant_id", String(restaurantId));
      const res = await setUserRoleAction(fd);
      if (!res.ok) alert(res.error);
    });
  };

  const revoke = () => {
    if (
      !confirm(
        "Remove this user's access to this restaurant? Their auth account stays — they just won't appear here anymore.",
      )
    )
      return;
    start(async () => {
      const fd = new FormData();
      fd.set("user_id", userId);
      fd.set("restaurant_id", String(restaurantId));
      const res = await revokeUserAction(fd);
      if (!res.ok) alert(res.error);
    });
  };

  const resetPassword = (mode: "typed" | "generate") => {
    start(async () => {
      const fd = new FormData();
      fd.set("user_id", userId);
      if (mode === "typed") fd.set("password", newPassword);
      const res = await resetPasswordAction(fd);
      if (res.ok) {
        setResetResult({
          kind: "ok",
          password: res.password ?? newPassword,
        });
        setNewPassword("");
      } else {
        setResetResult({ kind: "err", text: res.error });
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "h-8 w-8",
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Set role</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={currentRole === "user"}
            onSelect={() => setRole("user")}
          >
            Cashier
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={currentRole === "manager"}
            onSelect={() => setRole("manager")}
          >
            Manager
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={currentRole === "admin" || isSelf}
            onSelect={() => setRole("admin")}
          >
            Admin
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              setResetResult(null);
              setNewPassword("");
              setResetOpen(true);
            }}
          >
            Reset password…
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={isSelf}
            className="text-destructive focus:text-destructive"
            onSelect={revoke}
          >
            Revoke access
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for{" "}
              <span className="font-medium">{userEmail}</span>. They'll need
              this to sign in next.
            </DialogDescription>
          </DialogHeader>

          {resetResult?.kind === "ok" ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="font-medium text-emerald-900">Password updated.</p>
              <p className="mt-1 text-emerald-800">
                <span className="text-muted-foreground">New password:</span>{" "}
                <span className="font-mono">{resetResult.password}</span>
              </p>
              <p className="mt-2 text-xs text-emerald-700">
                Share securely. Won't be shown again.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="new-pw">New password</Label>
                <Input
                  id="new-pw"
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
              {resetResult?.kind === "err" && (
                <p className="text-sm text-destructive" role="alert">
                  {resetResult.text}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {resetResult?.kind === "ok" ? (
              <Button onClick={() => setResetOpen(false)}>Done</Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => resetPassword("generate")}
                  disabled={pending}
                >
                  Generate
                </Button>
                <Button
                  onClick={() => resetPassword("typed")}
                  disabled={pending || newPassword.length < 8}
                >
                  Set password
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
