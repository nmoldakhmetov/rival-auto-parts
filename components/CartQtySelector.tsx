"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

// Quantity selector: bound to the cart (in-cart editing) or, without
// `onRemove`, a local picker on product cards. The number is a real editable
// field, so a wholesale buyer can type e.g. 200 right in the catalog instead
// of tapping + hundreds of times. − at the minimum removes the item when
// `onRemove` is given, otherwise it's disabled. `step` > 1 (pair-only goods)
// makes ± move by that step; typed values are committed on blur/Enter and
// snapped to the step by the owner (cart store / card handler).
export default function CartQtySelector({
  qty,
  onSet,
  onRemove,
  step = 1,
  max,
}: {
  qty: number;
  onSet: (n: number) => void;
  onRemove?: () => void;
  step?: number;
  // Остаток склада: больше него набрать нельзя. Не задан — ограничения нет
  // (например, у клиента остаток скрыт как «>70», точного числа он не знает,
  // и решает сервер при оформлении).
  max?: number;
}) {
  const cap = (n: number) =>
    Math.min(max != null ? Math.max(step, max) : Infinity, n);
  const [draft, setDraft] = useState(String(qty));
  // Reflect external changes (±, edits elsewhere) back into the field.
  useEffect(() => {
    setDraft(String(qty));
  }, [qty]);
  // ± must read the LIVE qty: two clicks landing in one tick would both see
  // the same stale prop and lose one increment (qty+step computed twice).
  // The ref moves optimistically on click and re-syncs from the prop (the
  // owner may snap the value, e.g. pair-only quantities).
  const qtyRef = useRef(qty);
  useEffect(() => {
    qtyRef.current = qty;
  }, [qty]);
  function bump(delta: number) {
    const next = cap(Math.max(step, qtyRef.current + delta));
    qtyRef.current = next;
    onSet(next);
  }

  function change(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setDraft(digits);
    if (step > 1) return; // stepped items commit on blur/Enter (store snaps)
    const n = parseInt(digits, 10);
    if (Number.isFinite(n) && n >= 1) onSet(cap(Math.min(n, 100000)));
  }
  // On blur, commit stepped input / snap an empty or zero field back to the
  // current quantity (removal is the minus button's job, never empty input).
  function normalize() {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) {
      setDraft(String(qty));
      return;
    }
    if (step > 1) {
      onSet(cap(Math.min(n, 100000)));
      setDraft(String(qty)); // store snap re-syncs via the effect above
      return;
    }
    // Набрали больше остатка — возвращаем к максимуму, а не молча оставляем.
    if (max != null && n > max) onSet(cap(n));
  }

  return (
    <div
      className="flex h-9 w-full items-center justify-between rounded-md bg-gray-100"
      title={step > 1 ? `Продаётся только парами — шаг ${step} шт` : undefined}
    >
      <button
        onClick={() => (qtyRef.current <= step ? onRemove?.() : bump(-step))}
        disabled={qty <= step && !onRemove}
        title={
          qty > step
            ? "Уменьшить"
            : onRemove
              ? "Убрать из корзины"
              : "Минимальное количество"
        }
        className="flex h-full w-10 shrink-0 items-center justify-center rounded-l-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
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
        onClick={() => bump(step)}
        disabled={max != null && qty >= max}
        title={
          max != null && qty >= max
            ? `На складе всего ${max} шт`
            : "Добавить ещё"
        }
        className="flex h-full w-10 shrink-0 items-center justify-center rounded-r-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
