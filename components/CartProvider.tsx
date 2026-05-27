"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "@/lib/types";

export type SelectedOption = {
  group_id: number;
  group_name: string;
  option_id: number;
  option_name: string;
  price: number;
};

export type CartLine = {
  /** Stable key per (product, options[]) combo so the same product with
   *  different modifier picks shows as separate cart lines. */
  configKey: string;
  product: Product;
  quantity: number;
  selectedOptions: SelectedOption[];
  /** Computed at add-time: base price + sum(option prices). */
  unitPrice: number;
};

type CartContextValue = {
  restaurantSlug: string;
  lines: CartLine[];
  /** Add a product with optional modifier selections. */
  add: (product: Product, selectedOptions?: SelectedOption[]) => void;
  remove: (configKey: string) => void;
  setQuantity: (configKey: string, qty: number) => void;
  clear: () => void;
  subtotal: number;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);

function storageKey(slug: string) {
  return `billjot.cart.${slug}.v2`;
}

function buildConfigKey(productId: number, options: SelectedOption[]): string {
  if (options.length === 0) return `p${productId}`;
  const ids = options.map((o) => o.option_id).sort((a, b) => a - b);
  return `p${productId}:${ids.join("-")}`;
}

export function CartProvider({
  children,
  restaurantSlug,
}: {
  children: ReactNode;
  restaurantSlug: string;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(restaurantSlug));
      if (raw) setLines(JSON.parse(raw));
      else setLines([]);
    } catch {}
  }, [restaurantSlug]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(restaurantSlug), JSON.stringify(lines));
    } catch {}
  }, [lines, restaurantSlug]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const count = lines.reduce((s, l) => s + l.quantity, 0);

    return {
      restaurantSlug,
      lines,
      subtotal,
      count,
      add: (product, selectedOptions = []) =>
        setLines((prev) => {
          const configKey = buildConfigKey(product.id, selectedOptions);
          const existing = prev.find((l) => l.configKey === configKey);
          if (existing) {
            return prev.map((l) =>
              l.configKey === configKey
                ? { ...l, quantity: l.quantity + 1 }
                : l,
            );
          }
          const unitPrice =
            Number(product.price) +
            selectedOptions.reduce((s, o) => s + Number(o.price), 0);
          return [
            ...prev,
            {
              configKey,
              product,
              quantity: 1,
              selectedOptions,
              unitPrice,
            },
          ];
        }),
      remove: (configKey) =>
        setLines((prev) => prev.filter((l) => l.configKey !== configKey)),
      setQuantity: (configKey, qty) =>
        setLines((prev) =>
          qty <= 0
            ? prev.filter((l) => l.configKey !== configKey)
            : prev.map((l) => (l.configKey === configKey ? { ...l, quantity: qty } : l)),
        ),
      clear: () => setLines([]),
    };
  }, [lines, restaurantSlug]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
