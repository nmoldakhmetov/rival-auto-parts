"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Trash2,
  ShoppingCart,
  Send,
  Loader2,
  CheckCircle2,
  MessageCircle,
  TriangleAlert,
  Gift,
  Info,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useCart, cartSum } from "@/store/cart";
import { formatTenge, formatDiscount } from "@/lib/format";
import type { CatalogRow } from "@/lib/types";
import { earnedGiftQty, type GiftRuleLite as GiftRule } from "@/lib/gift-earn";
import EmptyState from "@/components/EmptyState";
import CartQtySelector from "@/components/CartQtySelector";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  PAYMENT_OPTIONS,
  DELIVERY_OPTIONS,
  PAYMENT_LABELS,
  DELIVERY_LABELS,
  type PaymentMethod,
  type DeliveryMethod,
} from "@/lib/order-options";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Выбор склада для позиции. Показывается, только когда складов с остатком
// больше одного: при единственном складе выбирать не из чего, и сервер
// проставляет его сам. Заказ уходит в 1С отдельным документом на каждый
// склад, поэтому выбор обязателен — без него оформление заблокировано.
function WarehousePicker({
  options,
  value,
  onChange,
}: {
  options: { name: string; qty: number; capped?: boolean }[];
  value?: string | null;
  onChange: (name: string) => void;
}) {
  return (
    <div className="mt-1.5">
      <div
        className={cx(
          "mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide",
          value ? "text-muted" : "text-accent"
        )}
      >
        <WarehouseIcon size={11} />
        {value ? "Склад" : "Выберите склад"}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.name}
            type="button"
            onClick={() => onChange(o.name)}
            className={cx(
              "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
              value === o.name
                ? "border-accent bg-accent/10 text-accent"
                : "border-line bg-white text-muted hover:border-accent/40 hover:text-ink"
            )}
          >
            {o.name}
            <span className="ml-1 text-[10px] opacity-70">
              {o.capped ? `>${o.qty}` : o.qty} шт
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const { items, setQty, remove, removeMany, setWarehouse, clear } = useCart();
  const [mounted, setMounted] = useState(false);
  // Склады, доступные клиенту по каждой позиции (из /api/cart/reprice).
  // Если их больше одного — клиент выбирает, с какого заказывать: заказ
  // уходит в 1С отдельным документом на каждый склад.
  const [whOptions, setWhOptions] = useState<
    Record<string, { name: string; qty: number; capped?: boolean }[]>
  >({});
  // Выбор позиций для оформления. Храним СНЯТЫЕ галочки, а не поставленные:
  // по умолчанию выбрано всё, и товар, добавленный уже на этой странице,
  // автоматически попадает в заказ, а не теряется молча.
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const isChecked = (id: string) => !unchecked.has(id);
  const toggleOne = (id: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CheckoutResult | null>(null);
  // «Оформить заказ» opens a confirmation dialog first — no accidental orders.
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Массовое удаление тоже спрашивает подтверждение: промах по кнопке рядом
  // с «Выбрать все» стоил бы клиенту всей набранной корзины.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Способ оплаты / получения — уходят в 1С, в письмо менеджеру и в WhatsApp.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("DELIVERY");

  const [giftRules, setGiftRules] = useState<GiftRule[]>([]);
  const [giftProducts, setGiftProducts] = useState<Record<string, CatalogRow>>(
    {}
  );
  // Return-policy texts (admin-editable Settings; the variant shown depends on
  // whether the cart earned a promo gift).
  const [policyDefault, setPolicyDefault] = useState("");
  const [policyGift, setPolicyGift] = useState("");

  useEffect(() => setMounted(true), []);

  // The persisted cart holds price snapshots from the moment of adding —
  // discount rules / 1С prices may have moved since. Re-price once per visit
  // so «Итого» matches what /api/orders will actually charge. getState()
  // avoids re-running when updatePrices itself changes the items.
  useEffect(() => {
    const ids = useCart.getState().items.map((i) => i.productId);
    if (ids.length === 0) return;
    fetch("/api/cart/reprice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.warehouses) {
          setWhOptions(d.warehouses);
          // Единственный доступный склад выбирать незачем — проставляем сам;
          // и снимаем выбор, который успел устареть (склад кончился).
          const st = useCart.getState();
          for (const i of st.items) {
            const opts: { name: string }[] = d.warehouses[i.productId] ?? [];
            if (opts.length === 1) {
              if (i.warehouse !== opts[0].name)
                st.setWarehouse(i.productId, opts[0].name);
            } else if (
              i.warehouse &&
              !opts.some((o) => o.name === i.warehouse)
            ) {
              st.setWarehouse(i.productId, null);
            }
          }
        }
        if (d?.prices) useCart.getState().updatePrices(d.prices);
      })
      .catch(() => {});
  }, []);

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

  // Всё, что дальше считается и оформляется, берётся ТОЛЬКО из отмеченных
  // позиций: и «Итого», и подарки, и состав заказа.
  const selected = useMemo(
    () => items.filter((i) => !unchecked.has(i.productId)),
    [items, unchecked]
  );

  const earnedGifts = useMemo(() => {
    if (giftRules.length === 0) return [] as { row: CatalogRow; qty: number }[];
    const qtyById = new Map(selected.map((i) => [i.productId, i.qty]));
    const earned = earnedGiftQty(giftRules, qtyById);
    return [...earned.entries()]
      .map(([id, qty]) => ({ row: giftProducts[id], qty }))
      .filter((g) => g.row);
  }, [selected, giftRules, giftProducts]);

  async function checkout() {
    setError(null);
    setLoading(true);
    try {
      const ordered = selected.map((i) => i.productId);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            warehouse: i.warehouse ?? null,
          })),
          comment,
          paymentMethod,
          deliveryMethod,
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
      // Из корзины уходят только оформленные позиции — невыбранные остаются.
      removeMany(ordered);
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

        {/* После частичного оформления в корзине осталось невыбранное —
            подсказываем и даём вернуться туда. */}
        {items.length > 0 && (
          <p className="mt-4 text-sm text-muted">
            В корзине остались невыбранные позиции: {items.length}.
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-ghost">
            Вернуться в каталог
          </Link>
          {items.length > 0 && (
            <button onClick={() => setDone(null)} className="btn-ghost">
              Вернуться в корзину
            </button>
          )}
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

  const total = cartSum(selected);
  const allChecked = selected.length === items.length;
  const noneChecked = selected.length === 0;
  // Позиции, где склад ещё не выбран (а выбирать есть из чего). Пока такие
  // есть, оформлять нельзя: иначе за клиента решил бы сервер, а заказ
  // разъехался бы по документам 1С не туда, куда клиент рассчитывал.
  const needWarehouse = selected.filter(
    (i) => (whOptions[i.productId]?.length ?? 0) > 1 && !i.warehouse
  );
  // «Выбрать все» / «Снять все» одной кнопкой — в корзине оптовика позиций
  // бывает много, и щёлкать каждую ради полного заказа бессмысленно.
  const toggleAll = () =>
    setUnchecked(allChecked ? new Set(items.map((i) => i.productId)) : new Set());

  // Total saved on 1С promo drops — shown in the summary when > 0. Derived
  // from the promo % only, so the personal discount stays invisible.
  const savings = selected.reduce(
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
          {!allChecked && ` · выбрано ${selected.length}`}
        </span>
      </h1>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_320px]">
        {/* Items */}
        <div className="min-w-0">
          {/* Выбор позиций: оформить можно часть корзины, остальное
              останется на месте. Строка «выбрать все» общая для обоих видов. */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium text-ink">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                className="h-4 w-4 shrink-0 accent-[#E53935]"
              />
              {allChecked ? "Снять выделение" : "Выбрать все"}
              <span className="text-muted">
                ({selected.length} из {items.length})
              </span>
            </label>
            {/* Удалить отмеченные разом: чистить корзину по одной позиции
                корзинкой в каждой строке было слишком долго. */}
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={noneChecked}
              title={
                noneChecked
                  ? "Отметьте позиции, которые нужно убрать"
                  : "Убрать отмеченные позиции из корзины"
              }
              className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-muted"
            >
              <Trash2 size={14} />
              Удалить выбранное
              {!noneChecked && <span>({selected.length})</span>}
            </button>
          </div>

          {/* Mobile: item cards (no horizontal scrolling) */}
          <div className="space-y-3 sm:hidden">
            {items.map((i) => {
              const step = i.pairOnly ? 2 : 1;
              return (
                <div
                  key={`m-${i.productId}`}
                  className={cx(
                    "rounded-lg border bg-white p-3 transition-colors",
                    isChecked(i.productId)
                      ? "border-line"
                      : "border-dashed border-gray-300 bg-gray-50/60"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked(i.productId)}
                        onChange={() => toggleOne(i.productId)}
                        aria-label={`Выбрать ${i.sku} для оформления`}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#E53935]"
                      />
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
                        {(whOptions[i.productId]?.length ?? 0) > 1 && (
                          <WarehousePicker
                            options={whOptions[i.productId]}
                            value={i.warehouse}
                            onChange={(name) => setWarehouse(i.productId, name)}
                          />
                        )}
                      </div>
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
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    title={allChecked ? "Снять выделение" : "Выбрать все"}
                    aria-label="Выбрать все позиции"
                    className="h-4 w-4 accent-[#E53935]"
                  />
                </th>
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
                <tr
                  key={i.productId}
                  className={cx(!isChecked(i.productId) && "bg-gray-50/70")}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={isChecked(i.productId)}
                      onChange={() => toggleOne(i.productId)}
                      aria-label={`Выбрать ${i.sku} для оформления`}
                      className="h-4 w-4 accent-[#E53935]"
                    />
                  </td>
                  <td>
                    <div className="font-semibold text-ink">{i.sku}</div>
                    <div className="text-[11px] text-muted">{i.name}</div>
                    {i.pairOnly && (
                      <div className="mt-0.5 text-[10px] font-semibold text-muted">
                        продаётся парами (шаг 2 шт)
                      </div>
                    )}
                    {(whOptions[i.productId]?.length ?? 0) > 1 && (
                      <WarehousePicker
                        options={whOptions[i.productId]}
                        value={i.warehouse}
                        onChange={(name) => setWarehouse(i.productId, name)}
                      />
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
                    {/* Same qty control as the mobile cards / catalog: draft
                        input (can be cleared while typing), shared caps. */}
                    <div className="mx-auto w-32">
                      <CartQtySelector
                        qty={i.qty}
                        step={step}
                        onSet={(n) => setQty(i.productId, n)}
                        onRemove={() => remove(i.productId)}
                      />
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
                  <td></td>
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
            <span className="text-sm text-muted">
              Итого
              {/* Явно говорим, что сумма — по отмеченным позициям, иначе
                  расхождение с «всей корзиной» выглядит как ошибка. */}
              {!allChecked && (
                <span className="block text-[11px] text-muted">
                  по выбранным ({selected.length} из {items.length})
                </span>
              )}
            </span>
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

          {/* Способ оплаты и получения — обязательные поля заказа. */}
          <div className="mb-3 space-y-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Способ оплаты
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as PaymentMethod)
                }
                className="input"
              >
                {PAYMENT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Способ доставки
              </label>
              <select
                value={deliveryMethod}
                onChange={(e) =>
                  setDeliveryMethod(e.target.value as DeliveryMethod)
                }
                className="input"
              >
                {DELIVERY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                {deliveryMethod === "PICKUP"
                  ? "Заберёте заказ на складе самостоятельно."
                  : "Доставим по адресу из вашей карточки — уточнить его можно у менеджера."}
              </p>
            </div>
          </div>

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

          {noneChecked && (
            <div className="mb-3 rounded border border-line bg-gray-50 px-3 py-2 text-xs text-muted">
              Отметьте товары, которые хотите заказать.
            </div>
          )}
          {!noneChecked && needWarehouse.length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
              <WarehouseIcon size={14} className="mt-0.5 shrink-0" />
              <span>
                Выберите склад для {needWarehouse.length}{" "}
                {needWarehouse.length === 1 ? "позиции" : "позиций"}:{" "}
                {needWarehouse.map((i) => i.sku).join(", ")}. Товары с разных
                складов уедут в 1С отдельными заказами.
              </span>
            </div>
          )}

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={loading || noneChecked || needWarehouse.length > 0}
            className="btn-accent w-full"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {allChecked
              ? "Оформить заказ"
              : `Оформить выбранное (${selected.length})`}
          </button>
          <ConfirmDialog
            open={confirmOpen}
            title="Оформление заказа"
            text={
              `Вы действительно хотите оформить этот заказ? ` +
              `Позиций — ${selected.length}` +
              (allChecked ? "" : ` из ${items.length} (остальные останутся в корзине)`) +
              `, сумма — ${formatTenge(total)}. ` +
              `Оплата: ${PAYMENT_LABELS[paymentMethod].toLowerCase()}, ` +
              `получение: ${DELIVERY_LABELS[deliveryMethod].toLowerCase()}.`
            }
            confirmLabel="Да"
            cancelLabel="Нет"
            onCancel={() => setConfirmOpen(false)}
            onConfirm={() => {
              setConfirmOpen(false);
              checkout();
            }}
          />
          <button
            onClick={clear}
            className="mt-3 w-full text-center text-xs text-muted hover:text-accent"
          >
            Очистить корзину
          </button>
          <ConfirmDialog
            open={confirmDelete}
            title="Удалить из корзины"
            text={
              selected.length === items.length
                ? `Убрать из корзины все позиции (${items.length})?`
                : `Убрать из корзины отмеченные позиции: ${selected.length} из ${items.length}? Остальные останутся.`
            }
            confirmLabel="Удалить"
            cancelLabel="Отмена"
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              removeMany(selected.map((i) => i.productId));
              setUnchecked(new Set());
              setConfirmDelete(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}
