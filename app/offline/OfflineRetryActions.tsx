"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Home, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OfflineRetryActions() {
  const [mounted, setMounted] = useState(false);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : false);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        {mounted && online ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Wifi className="h-3.5 w-3.5" />
            Connection restored — ready to reload
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            <WifiOff className="h-3.5 w-3.5" />
            Waiting for internet connection
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={() => window.location.reload()}
          className="flex-1"
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Retry Connection
        </Button>
        <Link
          href="/"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "flex-1",
          )}
        >
          <Home className="mr-1.5 h-4 w-4" />
          Open Console Home
        </Link>
      </div>
    </div>
  );
}
