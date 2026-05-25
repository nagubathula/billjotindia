"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";

export function Navbar() {
  const { count } = useCart();
  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-primary">
          Billjot India
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="hover:text-primary">Menu</Link>
          <Link href="/admin/orders" className="hover:text-primary">Admin</Link>
          <Link
            href="/cart"
            className="rounded-full bg-primary px-3 py-1 text-primary-foreground"
          >
            Cart ({count})
          </Link>
        </nav>
      </div>
    </header>
  );
}
