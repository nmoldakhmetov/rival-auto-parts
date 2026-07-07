"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingCart,
  Send,
  Loader2,
  CheckCircle2,
  MessageCircle,
  TriangleAlert,
  Gift,
  Info,
} from "lucide-react";
import { useCart, cartSum } from "@/store/cart";
import { formatTenge, formatDiscount } from "@/lib/format";
import type { CatalogRow } from "@/lib/types";
import { earnedGiftQty, type GiftRuleLite as GiftRule } from "@/lib/gift-earn";
import EmptyState from "@/components/EmptyState";
import CartQtySelector from "@/components/CartQtySelector";

type CheckoutResult = {
  orderNo: string;
  waLink: string | null;
  manager: { fullName: string; phone: string | null } | null;
};

export default function Cart({
  discountDisplay,
}: {
  discountDisplay?: string;
}) {
  const { items, setQty, remove, clear } = useCart();
  const [mounted, setMounted] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CheckoutResult | null>(null);

  const [giftRules, setGiftRules] = useState<GiftRule[]>([]);
  const [giftProducts, setGiftProducts] = useState<Record<string, CatalogRow>>(
    {}
  );
  // Return-policy texts (admin-editable Settings; the variant shown depends on
  // whether the cart earned a promo gift).
  const [policyDefault, setPolicyDefault] = useState("");
  const [policyGift, setPolicyGift] = useState("");

  useEffect(() => setMounted(true), []);

  // Active gift promos → free items earned by the current cart contents. The
  // server re-computes these on checkout; here it's display only.
  useEffect(() => {
    fetch("/api/gifts")
      .then((r) => r.json())
      .then((d) => {
        setGiftRules(d.rules ?? []);
        setGiftProducts(d.giftProducts ?? {});
        if (d.returnPolicyDefault) setPolicyDefault(d.returnPolicyDefault);
        if (d.returnPolicyGift) setPolicyGift(d.returnPolicyGift);
      })
      .catch(() => {});
  }, []);

  const earnedGifts = useMemo(() => {
    if (giftRules.length === 0) return [] as { row: CatalogRow; qty: number }[];
    const qtyById = new Map(items.map((i) => [i.productId, i.qty]));
    const earned = earnedGiftQty(giftRules, qtyById);
    return [...earned.entries()]
      .map(([id, qty]) => ({ row: giftProducts[id], qty }))
      .filter((g) => g.row);
  }, [items, giftRules, giftProducts]);

  async function checkout() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
          comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось оформить заказ");
        return;
      }
      setDone({
        orderNo: data.orderNo,
        waLink: data.waLink,
        manager: data.manager,
      });
      clear();
      // Auto-open WhatsApp if we have a link.
      if (data.waLink) window.open(data.waLink, "_blank");
    } catch {
      setError("Сервер недоступен. Повторите попытку.");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) {
    // Skeleton mirrors the real layout (items table + summary card), so the
    // page doesn't jump when the persisted cart hydrates.
    return (
      <div className="px-6 py-6">
        <div className="skeleton mb-4 h-7 w-44" />
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-lg border border-line bg-white p-4">
            <div className="skeleton mb-4 h-4 w-full" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-t border-line py-3"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
                <div className="skeleton h-4 w-16" />
                <div className="skeleton h-7 w-28" />
                <div className="skeleton h-4 w-20" />
              </div>
            ))}
          </div>
          <div className="h-fit rounded-lg border border-line bg-white p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <div className="skeleton h-4 w-14" />
              <div className="skeleton h-7 w-28" />
            </div>
            <div className="skeleton mb-3 h-20 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Success screen ────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="mx-auto max-w-lg px-6 py-12 text-center">
        <CheckCircle2 size={48} className="mx-auto mb-3 text-green-600" />
        <h1 className="text-xl font-bold text-ink">
          Заказ №{done.orderNo} оформлен
        </h1>
        <p className="mt-1 text-sm text-muted">
          Заказ сохранён. Отправьте его менеджеру в WhatsApp для подтверждения —
          оплата на портале не требуется.
        </p>

        <div className="mt-6 rounded-lg border border-line bg-white p-5">
          {done.waLink ? (
            <>
              <p className="mb-3 text-sm text-ink">
                Ваш менеджер:{" "}
                <span className="font-semibold">
                  {done.manager?.fullName}
                </span>
              </p>
              <a
                href={done.waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="btn w-full bg-[#25D366] text-white hover:bg-[#1ebe5b]"
              >
                <MessageCircle size={18} /> Написать менеджеру в WhatsApp
              </a>
            </>
          ) : (
            <div className="flex items-start gap-2 text-left text-sm text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>
                За вами пока не закреплён менеджер с номером WhatsApp. Заказ
                сохранён — администратор свяжется с вами.
              </span>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="btn-ghost">
            Вернуться в каталог
          </Link>
          <Link href="/orders" className="btn-accent">
            Мои заказы
          </Link>
        </div>
      </div>
    );
  }

  // ─── Empty cart ────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <EmptyState
          Icon={ShoppingCart}
          title="Корзина пуста"
          hint="Добавьте товары из каталога, чтобы оформить заявку — менеджер получит её в WhatsApp."
        >
          <Link href="/" className="btn-accent">
            Перейти в каталог
          </Link>
          <Link href="/favorites" className="btn-ghost">
            Моё избранное
          </Link>
        </EmptyState>
      </div>
    );
  }

  const total = cartSum(items);
  // Total saved on 1С promo drops — shown in the summary when > 0. Derived
  // from the promo % only, so the personal discount stays invisible.
  const savings = items.reduce(
    (s, i) =>
      s +
      (i.oldPrice && i.discountPct && i.discountPct > 0
        ? Math.round((i.oldPrice * i.discountPct) / 100) * i.qty
        : 0),
    0
  );

  // ─── Cart contents ─────────────────────────────────────────────────────
  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="mb-4 text-xl font-bold text-ink">
        Корзина{" "}
        <span className="text-sm font-normal text-muted">
          · {items.length} поз.
        </span>
      </h1>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_320px]">
        {/* Items */}
        <div className="min-w-0">
          {/* Mobile: item cards (no horizontal scrolling) */}
          <div className="space-y-3 sm:hidden">
            {items.map((i) => {
              const step = i.pairOnly ? 2 : 1;
              return (
                <div
                  key={`m-${i.productId}`}
                  className="rounded-lg border border-line bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">{i.sku}</div>
                      <div className="line-clamp-2 text-[11px] text-muted">
                        {i.name}
                      </div>
                      {i.pairOnly && (
                        <div className="mt-0.5 text-[10px] font-semibold text-muted">
                          продаётся парами (шаг 2 шт)
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => remove(i.productId)}
                      title="Убрать из корзины"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-sm">
                    {i.discountPct && i.discountPct > 0 && i.oldPrice != null ? (
                      <>
                        <span className="text-[11px] text-gray-400 line-through">
                          {formatTenge(i.oldPrice)}
                        </span>
                        <span className="whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {formatDiscount(
                            discountDisplay,
                            i.discountPct ?? 0,
                            i.oldPrice,
                            i.price
                          )}
                        </span>
                        <span className="font-semibold text-ink">
                          {formatTenge(i.price)}
                        </span>
                      </>
                    ) : (
                      <span className="font-semibold text-ink">
                        {formatTenge(i.price)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="w-36">
                      <CartQtySelector
                        qty={i.qty}
                        step={step}
                        onSet={(n) => setQty(i.productId, n)}
                        onRemove={() => remove(i.productId)}
                      />
                    </div>
                    <div className="text-right font-bold text-ink">
                      {formatTenge(i.price * i.qty)}
                    </div>
                  </div>
                </div>
              );
            })}
            {earnedGifts.map((g) => (
              <div
                key={`m-gift-${g.row.id}`}
                className="rounded-lg border border-green-200 bg-green-50/60 p-3"
              >
                <div className="flex items-center gap-1.5 font-semibold text-ink">
                  <Gift size={14} className="text-green-600" />
                  {g.row.sku}
                  <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    подарок
                  </span>
                </div>
                <div className="text-[11px] text-muted">{g.row.name}</div>
                <div className="mt-1.5 flex items-center justify-between text-sm font-semibold text-green-700">
                  <span>Бесплатно × {g.qty}</span>
                  <span>0 ₸</span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop / tablet: the familiar table */}
          <div className="hidden overflow-hidden rounded-lg border border-line bg-white sm:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th className="w-28 text-right">Цена</th>
                <th className="w-36 text-center">Кол-во</th>
                <th className="w-32 text-right">Сумма</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                // Pair-only goods (диски UIDNU) step by 2 — the store snaps
                // any odd value, the buttons move a full pair at a time.
                const step = i.pairOnly ? 2 : 1;
                return (
                <tr key={i.productId}>
                  <td>
                    <div className="font-semibold text-ink">{i.sku}</div>
                    <div className="text-[11px] text-muted">{i.name}</div>
                    {i.pairOnly && (
                      <div className="mt-0.5 text-[10px] font-semibold text-muted">
                        продаётся парами (шаг 2 шт)
                      </div>
                    )}
                  </td>
                  <td className="text-right">
                    {i.discountPct && i.discountPct > 0 ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {i.oldPrice != null && (
                            <span className="text-[11px] text-gray-400 line-through">
                              {formatTenge(i.oldPrice)}
                            </span>
                          )}
                          <span className="whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {formatDiscount(
                              discountDisplay,
                              i.discountPct ?? 0,
                              i.oldPrice,
                              i.price
                            )}
                          </span>
                        </div>
                        <span className="font-semibold text-ink">
                          {formatTenge(i.price)}
                        </span>
                      </div>
                    ) : (
                      formatTenge(i.price)
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setQty(i.productId, i.qty - step)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-line hover:bg-gray-50"
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        value={i.qty}
                        onChange={(e) =>
                          setQty(
                            i.productId,
                            Math.max(1, parseInt(e.target.value) || 1)
                          )
                        }
                        className="h-7 w-12 rounded border border-line text-center text-sm outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => setQty(i.productId, i.qty + step)}
                        className="flex h-7 w-7 items-center justify-center rounded border border-line hover:bg-gray-50"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="text-right font-semibold text-ink">
                    {formatTenge(i.price * i.qty)}
                  </td>
                  <td>
                    <button
                      onClick={() => remove(i.productId)}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-accent/10 hover:text-accent"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
                );
              })}
              {earnedGifts.map((g) => (
                <tr key={`gift-${g.row.id}`} className="bg-green-50/50">
                  <td>
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <Gift size={14} className="text-green-600" />
                      {g.row.sku}
                      <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        подарок
                      </span>
                    </div>
                    <div className="text-[11px] text-muted">{g.row.name}</div>
                  </td>
                  <td className="text-right font-semibold text-green-700">
                    Бесплатно
                  </td>
                  <td className="text-center text-sm font-semibold text-green-700">
                    {g.qty}
                  </td>
                  <td className="text-right font-semibold text-green-700">0 ₸</td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Summary */}
        <div className="h-fit rounded-lg border border-line bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted">Итого</span>
            <span className="text-2xl font-bold text-ink">
              {formatTenge(total)}
            </span>
          </div>
          {savings > 0 && (
            <div className="-mt-2 mb-3 flex items-center justify-between text-xs">
              <span className="text-muted">Ваша скидка</span>
              <span className="rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700">
                −{formatTenge(savings)}
              </span>
            </div>
          )}

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий к заказу (необязательно)"
            rows={3}
            className="input mb-3 resize-none"
          />

          {/* Return policy — the wording depends on whether the order earns a
              promo gift; both texts are admin-editable Settings. */}
          {(earnedGifts.length > 0 ? policyGift : policyDefault) && (
            <div
              className={
                earnedGifts.length > 0
                  ? "mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800"
                  : "mb-3 flex items-start gap-2 rounded-lg border border-line bg-gray-50 px-3 py-2 text-xs leading-relaxed text-muted"
              }
            >
              {earnedGifts.length > 0 ? (
                <Gift size={14} className="mt-0.5 shrink-0 text-amber-600" />
              ) : (
                <Info size={14} className="mt-0.5 shrink-0" />
              )}
              <span>
                {earnedGifts.length > 0 ? policyGift : policyDefault}
              </span>
            </div>
          )}

          {error && (
            <div className="mb-3 rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent-dark">
              {error}
            </div>
          )}

          <button
            onClick={checkout}
            disabled={loading}
            className="btn-accent w-full"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            Оформить заказ
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            Оплата не требуется — заказ уйдёт менеджеру в WhatsApp
          </p>

          <button
            onClick={clear}
            className="mt-3 w-full text-center text-xs text-muted hover:text-accent"
          >
            Очистить корзину
          </button>
        </div>
      </div>
    </div>
  );
}
