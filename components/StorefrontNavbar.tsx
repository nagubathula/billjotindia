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
  const ini = initials(restaurantName) || "BJ";

  return (
    <header className="glass sticky top-0 z-30 border-b border-border">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-5">
        <Link
          href={`/r/${restaurantSlug}`}
          className="flex min-w-0 items-center gap-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-xs font-semibold text-primary-foreground">
            {ini.length <= 2 ? ini : <Store className="h-4 w-4" />}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold leading-tight tracking-tight">
              {restaurantName}
            </span>
            <span className="text-[11px] text-muted-foreground">Order online</span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-4 text-sm">
          <Link
            href={`/r/${restaurantSlug}`}
            className="hidden text-muted-foreground hover:text-foreground sm:inline"
          >
            Menu
          </Link>
          <CartLink href={`/r/${restaurantSlug}/cart`} />
          <Suspense fallback={<div className="h-8 w-20 animate-pulse rounded-full bg-muted" />}>
            <UserMenu next={`/r/${restaurantSlug}`} />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
