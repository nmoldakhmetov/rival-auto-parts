"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { snapPairQty } from "@/lib/pair-only";

export type CartItem = {
  productId: string;
  sku: string;
  name: string;
  price: number; // цена для клиента (уже со скидкой)
  oldPrice?: number | null; // зачёркнутая цена, если есть скидка
  discountPct?: number; // скидка 1С, % (для плашки в корзине)
  imageUrl?: string | null;
  pairOnly?: boolean; // «Диски UIDNU»: строго чётное количество (шаг 2)
  qty: number;
};

// Upper bound for a single line — matches the input cap in CartQtySelector
// and the server-side cap in /api/orders (protects the Decimal(12,2) total).
const MAX_QTY = 100_000;

export type RepricedFields = {
  price: number;
  oldPrice: number | null;
  discountPct: number;
};

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  // Убрать разом несколько позиций: после частичного оформления из корзины
  // уходят только заказанные, остальные остаются нетронутыми.
  removeMany: (productIds: string[]) => void;
  clear: () => void;
  // Refresh stale persisted price snapshots (see /api/cart/reprice).
  updatePrices: (prices: Record<string, RepricedFields>) => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item, qty = 1) =>
        set((state) => {
          // Pair-only items always hold an even quantity (min 2).
          const clamp = (n: number) => {
            const capped = Math.min(MAX_QTY, Math.max(1, n));
            return item.pairOnly ? snapPairQty(capped) : capped;
          };
          const existing = state.items.find(
            (i) => i.productId === item.productId
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? { ...i, qty: clamp(i.qty + qty) }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...item, qty: clamp(qty) }] };
        }),
      setQty: (productId, qty) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.productId !== productId) return i;
            const capped = Math.min(MAX_QTY, Math.max(1, qty));
            return { ...i, qty: i.pairOnly ? snapPairQty(capped) : capped };
          }),
        })),
      remove: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        })),
      removeMany: (productIds) =>
        set((state) => {
          const gone = new Set(productIds);
          return { items: state.items.filter((i) => !gone.has(i.productId)) };
        }),
      clear: () => set({ items: [] }),
      updatePrices: (prices) =>
        set((state) => ({
          items: state.items.map((i) => {
            const p = prices[i.productId];
            return p
              ? {
                  ...i,
                  price: p.price,
                  oldPrice: p.oldPrice,
                  discountPct: p.discountPct,
                }
              : i;
          }),
        })),
    }),
    { name: "rival-cart" }
  )
);

export const cartCount = (items: CartItem[]) =>
  items.reduce((acc, i) => acc + i.qty, 0);
export const cartSum = (items: CartItem[]) =>
  items.reduce((acc, i) => acc + i.qty * i.price, 0);
