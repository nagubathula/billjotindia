"use client";

import { useState } from "react";
import { Download, PlusSquare, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePwaInstall } from "@/components/PwaProvider";
import { cn } from "@/lib/utils";

type Variant = "sidebar" | "compact" | "auth";

export function PwaInstallButton({
  variant = "sidebar",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const {
    mounted,
    isStandalone,
    canPromptInstall,
    isIosInstallable,
    triggerInstall,
  } = usePwaInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  if (!mounted || isStandalone || (!canPromptInstall && !isIosInstallable)) {
    return null;
  }

  const handleClick = async () => {
    if (canPromptInstall) {
      await triggerInstall();
    } else if (isIosInstallable) {
      setIosGuideOpen(true);
    }
  };

  return (
    <>
      {variant === "sidebar" && (
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300",
            className,
          )}
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Install App</span>
        </button>
      )}

      {variant === "compact" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClick}
          className={cn(
            "h-8 border-emerald-500/30 bg-emerald-500/5 px-2.5 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300",
            className,
          )}
          title="Install Billjot Console App"
        >
          <Download className="h-3.5 w-3.5 sm:mr-1" />
          <span className="hidden sm:inline">Install</span>
        </Button>
      )}

      {variant === "auth" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClick}
          className={cn(
            "h-8 rounded-full border-emerald-500/30 bg-emerald-500/5 px-3.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300",
            className,
          )}
        >
          <Smartphone className="mr-1.5 h-3.5 w-3.5" />
          Install Billjot App
        </Button>
      )}

      <Dialog open={iosGuideOpen} onOpenChange={setIosGuideOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install Billjot on iPhone or iPad</DialogTitle>
            <DialogDescription>
              Add Billjot Console to your Home Screen for full-screen POS and
              faster launch.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 py-1 text-sm">
            <li className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Share className="h-4 w-4" />
              </span>
              <div>
                <div className="font-medium">1. Tap the Share button</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Open Safari&apos;s toolbar menu and tap the Share icon.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <PlusSquare className="h-4 w-4" />
              </span>
              <div>
                <div className="font-medium">
                  2. Tap &ldquo;Add to Home Screen&rdquo;
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Confirm the name &ldquo;Billjot&rdquo; and tap Add in the top
                  right.
                </p>
              </div>
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
}
