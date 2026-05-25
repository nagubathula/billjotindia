"use client";

import Image from "next/image";
import { useCart } from "@/components/CartProvider";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const isVeg = (product.veg_status ?? "Veg").toLowerCase() === "veg";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="relative aspect-[4/3] w-full bg-neutral-100">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">🍽️</div>
        )}
        <span
          className={`absolute left-2 top-2 inline-block h-3 w-3 rounded-sm border ${
            isVeg ? "border-green-700 bg-green-500" : "border-red-700 bg-red-500"
          }`}
          aria-label={isVeg ? "Veg" : "Non-veg"}
        />
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-tight">{product.name}</h3>
          <span className="whitespace-nowrap text-sm font-semibold">
            ₹{Number(product.price).toFixed(0)}
          </span>
        </div>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{product.description}</p>
        )}
        <button
          onClick={() => add(product)}
          className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Add
        </button>
      </div>
    </div>
  );
}
