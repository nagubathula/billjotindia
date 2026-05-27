// Customer-facing navbar for a single restaurant's storefront. Branded with
// the restaurant's name treatment, with the cart count and (lazy) user menu
// on the right.

import Link from "next/link";
import { Suspense } from "react";
import { Store } from "lucide-react";
import { CartLink } from "./CartLink";
import { UserMenu } from "./UserMenu";

type Props = {
  restaurantSlug: string;
  restaurantName: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((s) => s.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function StorefrontNavbar({ restaurantSlug, restaurantName }: Props) {
  const ini = initials(restaurantName) || "🍽";

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link
          href={`/r/${restaurantSlug}`}
          className="flex min-w-0 items-center gap-2"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
            {ini.length <= 2 ? ini : <Store className="h-4 w-4" />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold leading-tight">
              {restaurantName}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Order online
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-3 text-sm">
          <Link
            href={`/r/${restaurantSlug}`}
            className="hidden text-muted-foreground hover:text-foreground sm:inline"
          >
            Menu
          </Link>
          <CartLink href={`/r/${restaurantSlug}/cart`} />
          <Suspense fallback={<div className="h-8 w-20 animate-pulse rounded bg-muted" />}>
            <UserMenu next={`/r/${restaurantSlug}`} />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
