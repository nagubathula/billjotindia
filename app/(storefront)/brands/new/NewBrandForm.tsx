"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrandAction } from "../actions";

export function NewBrandForm() {
  const router = useRouter();
  const [state, formAction] = useFormState(createBrandAction, null);

  useEffect(() => {
    if (state?.ok) {
      router.replace(`/brands/${state.slug}`);
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Brand name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          placeholder="My Coffee Co."
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          We'll generate a URL like <span className="font-mono">/brands/my-coffee-co-…</span>
        </p>
      </div>

      {state && !state.ok && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Creating…" : "Create brand"}
    </Button>
  );
}
