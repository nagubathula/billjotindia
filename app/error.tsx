"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[Billjot UI Error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We ran into an unexpected error loading this screen. Our team logs
          every server failure automatically.
        </p>
        {error.digest && (
          <p className="mt-3 rounded-lg bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => router.push("/")}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
