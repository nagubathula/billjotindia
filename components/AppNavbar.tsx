// App-shell navbar for signed-in user pages (dashboard, brands). Plain
// Billjot branding + UserMenu — no cart, no restaurant context.

import Link from "next/link";
import { Suspense } from "react";
import { Receipt } from "lucide-react";
import { UserMenu } from "./UserMenu";

export function AppNavbar() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Receipt className="h-4 w-4" />
          </span>
          Billjot
        </Link>
        <Suspense fallback={<div className="h-8 w-20 animate-pulse rounded bg-muted" />}>
          <UserMenu next="/dashboard" />
        </Suspense>
      </div>
    </header>
  );
}
