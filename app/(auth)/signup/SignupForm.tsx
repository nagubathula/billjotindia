"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { MailCheck, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "./actions";

export function SignupForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(signUpAction, null);

  // If Supabase email confirmation is OFF the server returns a session;
  // the user is already signed in — drop them on their POS.
  useEffect(() => {
    if (state?.ok && state.emailSent === false) {
      router.replace(`/r/${state.restaurantSlug}/pos`);
      router.refresh();
    }
  }, [state, router]);

  if (state?.ok && state.emailSent) {
    return (
      <div className="grid gap-3 text-sm">
        <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 p-4">
          <Store className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-medium text-amber-900">Restaurant created.</p>
            <p className="mt-1 text-amber-800">
              Your URL is{" "}
              <span className="font-medium">/r/{state.restaurantSlug}/pos</span>.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-emerald-500/10 p-4">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
          <div>
            <p className="font-medium text-emerald-900">Check your inbox.</p>
            <p className="mt-1 text-emerald-800">
              We sent a confirmation link to{" "}
              <span className="font-medium">{state.email}</span>. Click it to
              verify your account — you'll land on your POS, signed in as
              admin.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Email didn't arrive? Check spam.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-5 [&_input]:h-11 [&_input]:rounded-xl">
      <div className="grid gap-2">
        <Label htmlFor="restaurant_name">Restaurant name</Label>
        <Input
          id="restaurant_name"
          name="restaurant_name"
          type="text"
          required
          placeholder="Coffee Day"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Your restaurant gets its own address, like{" "}
          <span className="font-medium text-foreground">/r/coffee-day</span>.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="display_name">Your name</Label>
        <Input
          id="display_name"
          name="display_name"
          type="text"
          autoComplete="name"
          required
          placeholder="Satya Nagubathula"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@yourshop.in"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          placeholder="At least 8 characters"
        />
      </div>

      {state && !state.ok && (
        <p className="rounded-xl bg-destructive/10 px-4 py-3 text-xs text-destructive" role="alert">
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
    <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
      {pending ? "Creating restaurant…" : "Create restaurant"}
    </Button>
  );
}
