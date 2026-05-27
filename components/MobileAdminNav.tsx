"use client";

// Mobile fallback for admin pages. Shows a hamburger button that opens the
// admin sidebar as a Sheet drawer. Sidebar is hidden via Tailwind below md;
// this nav is hidden above it.

import { useState } from "react";
import Link from "next/link";
import { Menu, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { AdminSidebar } from "@/components/AdminSidebar";
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
      <header className="flex items-center justify-between border-b bg-background px-3 py-2 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link
          href={`/r/${restaurant.slug}/admin/orders`}
          className="flex min-w-0 items-center gap-1.5"
        >
          <Store className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold">{restaurant.name}</span>
        </Link>
        <div className="w-9" /> {/* spacer to centre the title */}
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          {/* Reuse the same sidebar component. It hides itself above md via
              its hidden md:flex class — but inside a Sheet (always visible)
              the responsive class is overridden by the sheet container, so
              we wrap with a class to force visibility. */}
          <div className="flex h-full [&_aside]:flex [&_aside]:!h-full [&_aside]:!w-full">
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
