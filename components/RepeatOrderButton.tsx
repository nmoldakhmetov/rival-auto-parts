"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
import { useCart, cartKey } from "@/store/cart";
import { toast } from "@/store/toast";
import { formatTenge } from "@/lib/format";
import { isPairOnly } from "@/lib/pair-only";

type OrderLine = { productId: string | null; qty: number };

// One-click reorder: refills the cart with the order's items at TODAY's
// prices/discounts and availability (resolved server-side), then reports
// what was added and what had to be skipped.
export default function RepeatOrderButton({ items }: { items: OrderLine[] }) {
  const [busy, setBusy] = useState(false);
  const add = useCart((s) => s.add);
  const setQty = useCart((s) => s.setQty);
  const cartItems = useCart((s) => s.items);
  const router = useRouter();

  async function repeat() {
    const lines = items.filter(
      (i): i is { productId: string; qty: number } => !!i.productId
    );
    const missing = items.length - lines.length; // товар удалён из каталога
    if (lines.length === 0) {
      toast.error("Товары этого заказа больше недоступны в каталоге");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/cart/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: lines.map((l) => l.productId) }),
      });
      if (!res.ok) {
        toast.error("Не удалось обновить цены — попробуйте ещё раз");
        return;
      }
      const data: {
        rows: {
          id: string;
          sku: string;
          name: string;
          category: string | null;
          price: number;
          oldPrice: number | null;
          discountPct: number;
          imageUrl: string | null;
          totalQty: number;
        }[];
      } = await res.json();
      const byId = new Map(data.rows.map((r) => [r.id, r]));
      // Повтор кладёт товар без выбора склада — сервер подставит его сам,
      // поэтому и сверяемся с позицией без склада.
      const inCart = new Map(
        cartItems.map((i) => [cartKey(i.productId, i.warehouse), i.qty])
      );

      let added = 0;
      let skipped = missing;
      let sum = 0;
      for (const line of lines) {
        const p = byId.get(line.productId);
        if (!p || p.totalQty === 0) {
          skipped++;
          continue;
        }
        const key = cartKey(p.id, null);
        const existing = inCart.get(key);
        if (existing != null) {
          // Already in the cart → bump to at least the ordered quantity.
          if (line.qty > existing) setQty(key, line.qty);
        } else {
          add(
            {
              productId: p.id,
              sku: p.sku,
              name: p.name,
              price: p.price,
              oldPrice: p.oldPrice,
              discountPct: p.discountPct,
              imageUrl: p.imageUrl,
              // Пары (диски UIDNU): стор сам приведёт количество к чётному.
              pairOnly: isPairOnly(p.category),
            },
            line.qty
          );
        }
        added++;
        sum += p.price * line.qty;
      }

      if (added > 0) {
        toast.success(
          `В корзине ${added} ${plural(added)} из заказа на ${formatTenge(sum)}`
        );
        router.push("/cart");
      }
      if (skipped > 0) {
        toast.info(
          `${skipped} ${plural(skipped)} ${skipped === 1 ? "пропущена" : "пропущено"} — нет в наличии`
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={repeat}
      disabled={busy}
      className="btn-ghost h-8 gap-1.5 px-3 text-xs font-semibold"
      title="Снова добавить все товары заказа в корзину по актуальным ценам"
    >
      {busy ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <RotateCcw size={14} />
      )}
      Повторить заказ
    </button>
  );
}

function plural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "позиция";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "позиции";
  return "позиций";
}
