"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, MonitorSmartphone, Store } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AdminSidebar } from "@/components/AdminSidebar";
import { cn } from "@/lib/utils";
import type { AppRole, Restaurant } from "@/lib/types";

export function MobileAdminNav({
  restaurant,
  role,
  userEmail,
  userName,
}: {
  restaurant: Restaurant;
  role: AppRole;
  userEmail: string;
  userName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="glass-page sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border px-3 md:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </Button>
          <Link
            href={`/r/${restaurant.slug}/admin`}
            className="flex min-w-0 items-center gap-1.5"
          >
            <Store className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold tracking-tight">
              {restaurant.name}
            </span>
          </Link>
        </div>
        <Link
          href={`/r/${restaurant.slug}/pos`}
          className={cn(buttonVariants({ variant: "default", size: "xs" }))}
        >
          <MonitorSmartphone className="mr-1 h-3 w-3" />
          POS
        </Link>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <div
            onClick={() => setOpen(false)}
            className="flex h-full [&_aside]:flex [&_aside]:!h-full [&_aside]:!w-full"
          >
            <AdminSidebar
              restaurant={restaurant}
              role={role}
              userEmail={userEmail}
              userName={userName}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
