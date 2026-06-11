"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

// Quantity selector shown once a product is in the cart. The number is a real
// editable field, so a wholesale buyer can type e.g. 200 right in the catalog
// instead of tapping + hundreds of times. − at 1 removes the item.
export default function CartQtySelector({
  qty,
  onSet,
  onRemove,
}: {
  qty: number;
  onSet: (n: number) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState(String(qty));
  // Reflect external changes (±, edits elsewhere) back into the field.
  useEffect(() => {
    setDraft(String(qty));
  }, [qty]);

  function change(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setDraft(digits);
    const n = parseInt(digits, 10);
    if (Number.isFinite(n) && n >= 1) onSet(Math.min(n, 100000));
  }
  // On blur, an empty / zero field snaps back to the current quantity
  // (removal is the minus button's job, never an accidental empty input).
  function normalize() {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) setDraft(String(qty));
  }

  return (
    <div className="flex h-9 w-full items-center justify-between rounded-md bg-gray-100">
      <button
        onClick={() => (qty <= 1 ? onRemove() : onSet(qty - 1))}
        title={qty > 1 ? "Уменьшить" : "Убрать из корзины"}
        className="flex h-full w-10 shrink-0 items-center justify-center rounded-l-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-ink"
      >
        <Minus size={16} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => change(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={normalize}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label="Количество в корзине"
        className="h-full min-w-0 flex-1 bg-transparent text-center text-base font-semibold tabular-nums text-gray-900 outline-none"
      />
      <button
        onClick={() => onSet(qty + 1)}
        title="Добавить ещё"
        className="flex h-full w-10 shrink-0 items-center justify-center rounded-r-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-ink"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
