"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCart } from "@/components/CartProvider";
import { cn } from "@/lib/utils";

export function StripeReturnClient({
  slug,
  sessionId,
  returnCtx,
}: {
  slug: string;
  sessionId: string | null;
  returnCtx: string;
}) {
  const router = useRouter();
  const { clear } = useCart();
  const [state, setState] = useState<"verifying" | "success" | "error">(
    sessionId ? "verifying" : "error",
  );
  const [errorMsg, setErrorMsg] = useState<string>(
    sessionId ? "" : "Missing Stripe session ID.",
  );
  const started = useRef(false);

  useEffect(() => {
    if (!sessionId || started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch("/api/payments/stripe/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          order?: { id: string };
          error?: string;
        };
        if (!res.ok || !json.order?.id) {
          throw new Error(json.error ?? "Could not confirm Stripe payment");
        }
        setState("success");
        if (returnCtx !== "pos") {
          clear();
        }
        const target =
          returnCtx === "pos"
            ? `/r/${slug}/pos/receipt/${json.order.id}`
            : `/r/${slug}/orders/${json.order.id}`;
        router.replace(target);
      } catch (e) {
        setState("error");
        setErrorMsg(
          e instanceof Error ? e.message : "Payment verification failed",
        );
      }
    })();
  }, [sessionId, returnCtx, clear, router, slug]);

  return (
    <div className="mx-auto max-w-md py-16">
      <Card>
        <CardContent className="flex flex-col items-center py-10 text-center">
          {state === "verifying" && (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <h1 className="mt-4 text-base font-semibold">
                Confirming your Stripe payment...
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Please hold on a moment while we generate your order token.
              </p>
            </>
          )}

          {state === "success" && (
            <>
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <h1 className="mt-4 text-base font-semibold">
                Payment verified
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Redirecting to your live order receipt...
              </p>
            </>
          )}

          {state === "error" && (
            <>
              <AlertCircle className="h-8 w-8 text-destructive" />
              <h1 className="mt-4 text-base font-semibold">
                Could not confirm payment
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">{errorMsg}</p>
              <Link
                href={returnCtx === "pos" ? `/r/${slug}/pos` : `/r/${slug}/checkout`}
                className={cn(buttonVariants({ size: "sm" }), "mt-5")}
              >
                Return to Checkout
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
