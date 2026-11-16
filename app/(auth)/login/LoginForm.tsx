"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signInAction, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="next" value={next} />

      <div className="grid gap-2">
        <Label htmlFor="email" className="text-xs font-semibold text-foreground/90">
          Work or Staff Email
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@restaurant.in"
            className="h-11 rounded-xl pl-10"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label
          htmlFor="password"
          className="text-xs font-semibold text-foreground/90"
        >
          Password
        </Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            className="h-11 rounded-xl pr-10 pl-10"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {state?.error && (
        <p
          className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      className="mt-1 h-11 w-full rounded-xl text-sm font-semibold shadow-sm"
    >
      <span>{pending ? "Signing in…" : "Sign in"}</span>
      {!pending && <ArrowRight className="h-4 w-4" />}
    </Button>
  );
}
