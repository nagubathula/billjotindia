"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { Badge } from "@/components/ui/badge";

// Tiny client island so the rest of the storefront navbar can stay server-
// side. Accepts an explicit href because the cart URL depends on which
// restaurant the customer is browsing.
export function CartLink({ href }: { href: string }) {
  const { count } = useCart();
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
    >
      Cart
      <Badge
        variant={count > 0 ? "default" : "secondary"}
        className="min-w-[22px] px-1.5 tabular-nums"
      >
        {count}
      </Badge>
    </Link>
  );
}
