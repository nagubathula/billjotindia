"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildModifierConfigKey } from "@/lib/customizations";
import type { Product } from "@/lib/types";

export type SelectedOption = {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price: number;
  quantity?: number;
  unit_price?: number;
  veg_status?: string;
};

export type CartLine = {
  /** Stable key per (product, options[], instructions) combo so different
   *  customizations or cooking notes show as separate cart lines. */
  configKey: string;
  product: Product;
  quantity: number;
  selectedOptions: SelectedOption[];
  instructions?: string;
  /** Computed at add-time: base price + sum(option prices). */
  unitPrice: number;
};

type CartContextValue = {
  restaurantSlug: string;
  lines: CartLine[];
  tableName: string | null;
  setTableName: (table: string | null) => void;
  /** Add a product with optional modifier selections and cooking note. */
  add: (
    product: Product,
    selectedOptions?: SelectedOption[],
    instructions?: string,
  ) => void;
  /** Replace options & instructions on an existing cart line. */
  updateLine: (
    oldConfigKey: string,
    selectedOptions: SelectedOption[],
    instructions?: string,
  ) => void;
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

function tableStorageKey(slug: string) {
  return `billjot.table.${slug}.v1`;
}

function buildCartLineKey(
  productId: string,
  options: SelectedOption[],
  instructions?: string,
): string {
  const baseKey = buildModifierConfigKey(productId, options);
  const cleanNote = instructions?.trim().toLowerCase() ?? "";
  return cleanNote ? `${baseKey}~${cleanNote}` : baseKey;
}

export function CartProvider({
  children,
  restaurantSlug,
}: {
  children: ReactNode;
  restaurantSlug: string;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [tableName, setTableNameState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(restaurantSlug));
      if (raw) setLines(JSON.parse(raw));
      else setLines([]);

      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("table")?.trim();
      if (fromUrl) {
        sessionStorage.setItem(tableStorageKey(restaurantSlug), fromUrl);
        setTableNameState(fromUrl);
      } else {
        const savedTable = sessionStorage.getItem(tableStorageKey(restaurantSlug));
        setTableNameState(savedTable || null);
      }
    } catch {}
  }, [restaurantSlug]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(restaurantSlug), JSON.stringify(lines));
    } catch {}
  }, [lines, restaurantSlug]);

  const setTableName = useCallback(
    (t: string | null) => {
      setTableNameState(t);
      try {
        if (t) sessionStorage.setItem(tableStorageKey(restaurantSlug), t);
        else sessionStorage.removeItem(tableStorageKey(restaurantSlug));
      } catch {}
    },
    [restaurantSlug],
  );

  const value = useMemo<CartContextValue>(() => {
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const count = lines.reduce((s, l) => s + l.quantity, 0);

    return {
      restaurantSlug,
      lines,
      tableName,
      setTableName,
      subtotal,
      count,
      add: (product, selectedOptions = [], instructions) =>
        setLines((prev) => {
          const cleanNote = instructions?.trim() || undefined;
          const configKey = buildCartLineKey(
            product.id,
            selectedOptions,
            cleanNote,
          );
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
              instructions: cleanNote,
              unitPrice,
            },
          ];
        }),
      updateLine: (oldConfigKey, selectedOptions, instructions) =>
        setLines((prev) => {
          const target = prev.find((l) => l.configKey === oldConfigKey);
          if (!target) return prev;
          const cleanNote = instructions?.trim() || undefined;
          const newKey = buildCartLineKey(
            target.product.id,
            selectedOptions,
            cleanNote,
          );
          const unitPrice =
            Number(target.product.price) +
            selectedOptions.reduce((s, o) => s + Number(o.price), 0);

          if (newKey === oldConfigKey) {
            return prev.map((l) =>
              l.configKey === oldConfigKey
                ? {
                    ...l,
                    selectedOptions,
                    instructions: cleanNote,
                    unitPrice,
                  }
                : l,
            );
          }

          const duplicateTarget = prev.find((l) => l.configKey === newKey);
          if (duplicateTarget) {
            return prev
              .filter((l) => l.configKey !== oldConfigKey)
              .map((l) =>
                l.configKey === newKey
                  ? {
                      ...l,
                      quantity: l.quantity + target.quantity,
                      selectedOptions,
                      instructions: cleanNote,
                      unitPrice,
                    }
                  : l,
              );
          }

          return prev.map((l) =>
            l.configKey === oldConfigKey
              ? {
                  ...l,
                  configKey: newKey,
                  selectedOptions,
                  instructions: cleanNote,
                  unitPrice,
                }
              : l,
          );
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
  }, [lines, restaurantSlug, tableName, setTableName]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
