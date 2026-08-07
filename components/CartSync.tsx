"use client";

import { useEffect } from "react";
import { useCart } from "@/store/cart";

// Mirrors the local cart to the server (debounced) so admins can see clients'
// carts. Rendered once in the portal layout for CLIENT users.
export default function CartSync({ enabled }: { enabled: boolean }) {
  const items = useCart((s) => s.items);

  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      // Один товар может лежать в корзине двумя строками (с разных складов),
      // а в снимке для админки строка на товар одна — складываем количества,
      // иначе в PUT ушли бы дубли по productId.
      const merged = new Map<string, number>();
      for (const i of items) {
        merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.qty);
      }
      fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [...merged].map(([productId, qty]) => ({ productId, qty })),
        }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [items, enabled]);

  return null;
}
