"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import CartQtySelector from "@/components/CartQtySelector";

// Add-to-cart flow for product cards (grid): the quantity is picked locally
// first — the parent owns it so the card can multiply the displayed price
// live — and «В корзину» commits the whole amount to the cart at once,
// flashing a green «Добавлено ✓» confirmation before resetting the picker.
export default function AddToCartPanel({
  qty,
  step = 1,
  outOfStock,
  inCartQty = 0,
  onQtyChange,
  onAdd,
}: {
  qty: number;
  step?: number;
  outOfStock?: boolean;
  // Already in the cart (shown as a hint; the button always adds more).
  inCartQty?: number;
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

  if (outOfStock) {
    return (
      <button
        disabled
        title="Нет на складах — добавьте в избранное, чтобы не потерять"
        className="btn h-9 w-full cursor-not-allowed whitespace-nowrap bg-gray-100 text-muted"
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

  return (
    <div>
      <CartQtySelector qty={qty} step={step} onSet={onQtyChange} />
      <button
        onClick={commit}
        className={
          added
            ? "btn mt-2 h-9 w-full whitespace-nowrap bg-green-600 text-white"
            : "btn-accent mt-2 h-9 w-full whitespace-nowrap transition-all duration-200"
        }
      >
        {added ? (
          <>
            <Check size={16} /> Добавлено
          </>
        ) : (
          <>
            <ShoppingCart size={16} /> В корзину
          </>
        )}
      </button>
      {inCartQty > 0 && (
        <div className="mt-1.5 text-center text-[11px] font-semibold text-green-700">
          В корзине: {inCartQty} шт
        </div>
      )}
    </div>
  );
}
