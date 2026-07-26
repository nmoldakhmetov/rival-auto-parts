"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import CartQtySelector from "@/components/CartQtySelector";

// Add-to-cart flow for product rows/cards: the quantity is picked locally
// first — the parent owns it so the price can multiply live — and «В корзину»
// commits the whole amount to the cart at once, flashing a green «Добавлено ✓»
// confirmation before resetting the picker.
//
// `layout` — "stack": picker above a full-width button (grid cards);
//            "row":   picker and a compact button side by side (table rows).
export default function AddToCartPanel({
  qty,
  step = 1,
  outOfStock,
  inCartQty = 0,
  layout = "stack",
  onQtyChange,
  onAdd,
}: {
  qty: number;
  step?: number;
  outOfStock?: boolean;
  // Already in the cart (shown as a hint; the button always adds more).
  inCartQty?: number;
  layout?: "stack" | "row";
  onQtyChange: (n: number) => void;
  onAdd: (qty: number) => void;
}) {
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live qty for the flash-end reset check (the closure inside setTimeout
  // would otherwise see the value captured at commit time).
  const qtyRef = useRef(qty);
  useEffect(() => {
    qtyRef.current = qty;
  }, [qty]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const row = layout === "row";

  if (outOfStock) {
    return (
      <button
        disabled
        title="Нет на складах — добавьте в избранное, чтобы не потерять"
        className={
          row
            ? "btn h-9 w-full cursor-not-allowed whitespace-nowrap bg-gray-100 px-2 text-[11px] text-muted"
            : "btn h-9 w-full cursor-not-allowed whitespace-nowrap bg-gray-100 text-muted"
        }
      >
        Нет в наличии
      </button>
    );
  }

  function commit() {
    if (added) return;
    onAdd(qty);
    const committed = qty;
    setAdded(true);
    timer.current = setTimeout(() => {
      setAdded(false);
      // Fresh picker for the next add — but only if the user didn't already
      // start picking a new amount during the green flash.
      if (qtyRef.current === committed) onQtyChange(step);
    }, 1600);
  }

  const button = (
    <button
      onClick={commit}
      title={added ? "Добавлено в корзину" : "Добавить выбранное количество"}
      className={
        added
          ? `btn h-9 whitespace-nowrap bg-green-600 text-white ${row ? "shrink-0 px-3" : "mt-2 w-full"}`
          : `btn-accent h-9 whitespace-nowrap transition-all duration-200 ${row ? "shrink-0 px-3" : "mt-2 w-full"}`
      }
    >
      {added ? (
        <>
          <Check size={16} /> {row ? "" : "Добавлено"}
        </>
      ) : (
        <>
          <ShoppingCart size={16} /> {row ? "" : "В корзину"}
        </>
      )}
      {row && <span className="hidden text-[11px] xl:inline">В корзину</span>}
    </button>
  );

  if (row) {
    return (
      <div>
        <div className="flex items-center gap-1">
          <div className="w-24 shrink-0">
            <CartQtySelector qty={qty} step={step} onSet={onQtyChange} />
          </div>
          {button}
        </div>
        {inCartQty > 0 && (
          <div className="mt-1 text-[10px] font-semibold text-green-700">
            В корзине: {inCartQty} шт
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <CartQtySelector qty={qty} step={step} onSet={onQtyChange} />
      {button}
      {inCartQty > 0 && (
        <div className="mt-1.5 text-center text-[11px] font-semibold text-green-700">
          В корзине: {inCartQty} шт
        </div>
      )}
    </div>
  );
}
