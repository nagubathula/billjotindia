"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";

export default function CartPage() {
  const { lines, setQuantity, remove, subtotal, clear } = useCart();

  if (lines.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-neutral-500">Your cart is empty.</p>
        <Link href="/" className="mt-3 inline-block text-primary underline">
          Browse menu
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Your cart</h1>
      <ul className="divide-y rounded-xl border bg-white">
        {lines.map(({ product, quantity }) => (
          <li key={product.id} className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="font-medium">{product.name}</p>
              <p className="text-sm text-neutral-500">
                ₹{Number(product.price).toFixed(0)} each
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(product.id, quantity - 1)}
                className="h-7 w-7 rounded border"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="w-6 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(product.id, quantity + 1)}
                className="h-7 w-7 rounded border"
                aria-label="Increase"
              >
                +
              </button>
            </div>
            <span className="w-20 text-right font-semibold">
              ₹{(Number(product.price) * quantity).toFixed(0)}
            </span>
            <button
              onClick={() => remove(product.id)}
              className="text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-xl border bg-white p-4">
        <div>
          <p className="text-sm text-neutral-500">Subtotal</p>
          <p className="text-xl font-semibold">₹{subtotal.toFixed(0)}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={clear}
            className="rounded border px-3 py-2 text-sm"
          >
            Clear
          </button>
          <Link
            href="/checkout"
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
