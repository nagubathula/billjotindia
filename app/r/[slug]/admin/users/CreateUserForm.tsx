"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUserAction } from "./actions";

function randomPassword() {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(12))
      : Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  return Array.from(bytes, (b) => charset[b % charset.length]).join("");
}

export function CreateUserForm({ restaurantId }: { restaurantId: number }) {
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState("user");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(true);
  const [result, setResult] = useState<
    | { kind: "ok"; email: string; password: string }
    | { kind: "err"; text: string }
    | null
  >(null);

  return (
    <form
      action={(formData) => {
        formData.set("role", role);
        formData.set("password", password);
        formData.set("restaurant_id", String(restaurantId));
        const email = String(formData.get("email") ?? "");
        startTransition(async () => {
          const res = await createUserAction(formData);
          if (res.ok) {
            setResult({
              kind: "ok",
              email,
              // If server generated one, use that. Otherwise echo the one we typed.
              password: res.password ?? password,
            });
            setPassword("");
            (document.getElementById("create-form") as HTMLFormElement)?.reset();
            (document.getElementById("create-email") as HTMLInputElement)?.focus();
          } else {
            setResult({ kind: "err", text: res.error });
          }
        });
      }}
      id="create-form"
      className="grid gap-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="create-name">Name</Label>
          <Input
            id="create-name"
            name="display_name"
            type="text"
            required
            placeholder="Priya Kumar"
            autoComplete="name"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="create-email">Email</Label>
          <Input
            id="create-email"
            name="email"
            type="email"
            required
            placeholder="cashier@yourshop.in"
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => v && setRole(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Cashier</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="create-password">Password</Label>
          <button
            type="button"
            onClick={() => {
              setPassword(randomPassword());
              setShowPassword(true);
            }}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Generate
          </button>
        </div>
        <Input
          id="create-password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          placeholder="Type one, or click Generate"
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">
          Share this password with the user via a secure channel. They can
          change it themselves later.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create user"}
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />
          Show password
        </label>
      </div>

      {result?.kind === "err" && (
        <p className="text-sm text-destructive" role="alert">
          {result.text}
        </p>
      )}

      {result?.kind === "ok" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-900">User created.</p>
          <p className="mt-1 text-emerald-800">
            <span className="text-muted-foreground">Email:</span>{" "}
            <span className="font-mono">{result.email}</span>
          </p>
          <p className="text-emerald-800">
            <span className="text-muted-foreground">Password:</span>{" "}
            <span className="font-mono">{result.password}</span>
          </p>
          <p className="mt-2 text-xs text-emerald-700">
            Share these credentials securely with the user. They won't be
            shown again.
          </p>
        </div>
      )}
    </form>
  );
}
