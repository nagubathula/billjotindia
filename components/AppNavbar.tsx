// App-shell navbar for signed-in user pages (dashboard, brands). Plain
// Billjot branding + UserMenu — no cart, no restaurant context.

import Link from "next/link";
import { Suspense } from "react";
import { UserMenu } from "./UserMenu";

export function AppNavbar() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="text-lg font-semibold text-primary">
          Billjot
        </Link>
        <Suspense fallback={<div className="h-8 w-20 animate-pulse rounded bg-muted" />}>
          <UserMenu next="/dashboard" />
        </Suspense>
      </div>
    </header>
  );
}
