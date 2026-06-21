"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRestaurantAction } from "./actions";

// For an already-signed-in user adding another restaurant. Only asks for the
// restaurant name — no email/password, since the account already exists.
export function CreateRestaurantForm() {
  const router = useRouter();
  const [state, formAction] = useFormState(createRestaurantAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.push(`/r/${state.restaurantSlug}/admin/menu`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-4">
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
          We&apos;ll generate a URL slug like{" "}
          <span className="font-mono">/r/coffee-day-…</span>
        </p>
      </div>

      {state && !state.ok && (
        <p className="text-sm text-destructive" role="alert">
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
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating restaurant…" : "Create restaurant"}
    </Button>
  );
}
