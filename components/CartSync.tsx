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
      fetch("/api/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [items, enabled]);

  return null;
}
