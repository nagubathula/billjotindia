import { Receipt, WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { OfflineRetryActions } from "./OfflineRetryActions";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-emerald-50/60 via-background to-background px-4 py-10 dark:from-emerald-950/20">
      <Card className="w-full max-w-md rounded-2xl border-border/80 py-7 shadow-float">
        <CardContent className="space-y-6 px-6 text-center sm:px-8">
          <div className="mx-auto flex items-center justify-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Receipt className="h-6 w-6" />
            </span>
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
              <WifiOff className="h-5 w-5" />
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-wider text-primary uppercase">
              Billjot Console · Offline Mode
            </p>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              You&apos;re currently offline
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Live POS billing, table KOT routing, and kitchen display updates
              require an active internet connection. Check your Wi-Fi or mobile
              network and retry.
            </p>
          </div>

          <OfflineRetryActions />
        </CardContent>
      </Card>
    </main>
  );
}
