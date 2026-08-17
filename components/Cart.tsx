"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ImageOff,
  Maximize2,
  X,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useCart, cartSum, itemKey, type CartItem } from "@/store/cart";
import { formatTenge, formatDiscount } from "@/lib/format";
import type { CatalogRow } from "@/lib/types";
import { earnedGiftQty, type GiftRuleLite as GiftRule } from "@/lib/gift-earn";
import EmptyState from "@/components/EmptyState";
import CartQtySelector from "@/components/CartQtySelector";
import ConfirmDialog from "@/components/ConfirmDialog";
import KaspiPayment from "@/components/KaspiPayment";
import {
  PAYMENT_OPTIONS,
  DELIVERY_OPTIONS,
  PAYMENT_LABELS,
  DELIVERY_LABELS,
  type PaymentMethod,
  type DeliveryMethod,
} from "@/lib/order-options";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Миниатюра товара в корзине. Клик РАСКРЫВАЕТ картинку, а не уводит на
// страницу товара: до этого фото в корзине не было вовсе и клиент не мог
// проверить, то ли он положил. Переход в каталог — по артикулу рядом.
function CartThumb({
  item,
  onOpen,
}: {
  item: CartItem;
  onOpen: (src: string) => void;
}) {
  const src = item.imageUrl
    ? `/api/image?u=${encodeURIComponent(item.imageUrl)}`
    : null;
  if (!src) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-line bg-gray-50 text-gray-300">
        <ImageOff size={15} />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(src)}
      title="Посмотреть фото"
      className="group/th relative h-11 w-11 shrink-0 overflow-hidden rounded border border-line bg-white"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={item.sku}
        loading="lazy"
        className="h-full w-full object-contain"
      />
      <span className="absolute inset-0 hidden items-center justify-center bg-ink/40 text-white group-hover/th:flex">
        <Maximize2 size={14} />
      </span>
    </button>
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
  const router = useRouter();
  const { items, setQty, remove, removeMany, clear } = useCart();
  const [mounted, setMounted] = useState(false);
  // Просмотр фото прямо в корзине — картинка на весь экран, без ухода со
  // страницы (страницы товара в портале нет, есть каталог по артикулу).
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const openInCatalog = (sku: string) =>
    router.push(`/catalog?q=${encodeURIComponent(sku)}`);
  // Остатки по складам для позиций корзины (из /api/cart/reprice): по ним
  // количество нельзя поднять выше того, что реально есть на складе.
  const [whStock, setWhStock] = useState<
    Record<string, { name: string; qty: number; capped?: boolean }[]>
  >({});
  // Предел для строки: остаток ЕЁ склада. Скрытый остаток («>70») предела не
  // даёт — точного числа клиент не знает, лишнее отсечёт сервер.
  const maxFor = (i: CartItem) => {
    const opt = (whStock[i.productId] ?? []).find(
      (o) => o.name === (i.warehouse ?? "")
    );
    return opt && !opt.capped ? opt.qty : undefined;
  };
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
  // Онлайн-оплата Kaspi: способ показывается, только если её подключили в
  // админке. После оформления с этим способом открывается экран оплаты.
  // Клиенту с разрешением оплата ТОЛЬКО через Kaspi: выбора «через
  // менеджера» у него нет. Остальные платят как раньше.
  const [kaspiReady, setKaspiReady] = useState(false);
  const [payFor, setPayFor] = useState<{ orderId: string; amount: number } | null>(
    null
  );
  const [paidOnline, setPaidOnline] = useState(false);
  // «Оформить заказ» opens a confirmation dialog first — no accidental orders.
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Массовое удаление тоже спрашивает подтверждение: промах по кнопке рядом
  // с «Выбрать все» стоил бы клиенту всей набранной корзины.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Способ оплаты / получения — уходят в 1С, в письмо менеджеру и в WhatsApp.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [deliveryMethod, setDeliveryMethod] =
    useState<DeliveryMethod>("DELIVERY");

  // Адреса доставки клиента: их может быть несколько (склад, офис, точка
  // выдачи), и в 1С уходит именно выбранный здесь.
  const [addresses, setAddresses] = useState<
    { id: string; label: string | null; city: string | null; address: string; isDefault: boolean }[]
  >([]);
  const [addressId, setAddressId] = useState("");

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
        if (d?.warehouses) setWhStock(d.warehouses);
        if (d?.prices) useCart.getState().updatePrices(d.prices);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/payments/kaspi")
      .then((r) => r.json())
      .then((d) => {
        const ready = Boolean(d?.ready);
        setKaspiReady(ready);
        if (ready) setPaymentMethod("KASPI");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/addresses")
      .then((r) => r.json())
      .then((d) => {
        const list = d?.addresses ?? [];
        setAddresses(list);
        // По умолчанию — основной адрес, иначе первый в списке.
        const preferred = list.find((a: { isDefault: boolean }) => a.isDefault) ?? list[0];
        if (preferred) setAddressId(preferred.id);
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
    () => items.filter((i) => !unchecked.has(itemKey(i))),
    [items, unchecked]
  );

  const earnedGifts = useMemo(() => {
    if (giftRules.length === 0) return [] as { row: CatalogRow; qty: number }[];
    // Подарки считаются от общего количества товара: если он взят с двух
    // складов, для правила это по-прежнему один товар и сумма штук.
    const qtyById = new Map<string, number>();
    for (const i of selected) {
      qtyById.set(i.productId, (qtyById.get(i.productId) ?? 0) + i.qty);
    }
    const earned = earnedGiftQty(giftRules, qtyById);
    return [...earned.entries()]
      .map(([id, qty]) => ({ row: giftProducts[id], qty }))
      .filter((g) => g.row);
  }, [selected, giftRules, giftProducts]);

  async function checkout() {
    setError(null);
    setLoading(true);
    try {
      const ordered = selected.map((i) => itemKey(i));
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
          // Какой адрес выбрал клиент — именно он уедет в 1С.
          addressId: deliveryMethod === "DELIVERY" ? addressId : null,
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
      if (paymentMethod === "KASPI") {
        // Оплата — шаг оформления: заказ уже создан и виден менеджеру, а
        // экран оплаты открывается поверх экрана «заказ оформлен».
        setPayFor({ orderId: data.orderId, amount: data.total });
        return;
      }
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

  // ─── Экран оплаты Kaspi ────────────────────────────────────────────────
  // Заказ уже создан: что бы ни случилось с оплатой, он не теряется, и
  // менеджер его видит. Поэтому «не получилось» — это возврат на экран
  // «заказ оформлен», а не откат корзины.
  if (payFor) {
    return (
      <KaspiPayment
        orderId={payFor.orderId}
        amount={payFor.amount}
        onPaid={() => {
          setPaidOnline(true);
          setPayFor(null);
          if (done?.waLink) window.open(done.waLink, "_blank");
        }}
        onGiveUp={() => setPayFor(null)}
      />
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
          {paidOnline
            ? "Оплата прошла — заказ передан менеджеру и в 1С."
            : paymentMethod === "KASPI"
              ? "Заказ сохранён, но НЕ оплачен: пока оплата не прошла, менеджеру он не передан. Свяжитесь с менеджером, чтобы оплатить или оформить заказ иначе."
              : "Заказ сохранён. Отправьте его менеджеру в WhatsApp для подтверждения — оплата на портале не требуется."}
        </p>
        {paidOnline && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            <CheckCircle2 size={13} /> Оплачено через Kaspi
          </div>
        )}

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
  // «Выбрать все» / «Снять все» одной кнопкой — в корзине оптовика позиций
  // бывает много, и щёлкать каждую ради полного заказа бессмысленно.
  const toggleAll = () =>
    setUnchecked(allChecked ? new Set(items.map((i) => itemKey(i))) : new Set());

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
              const key = itemKey(i);
              return (
                <div
                  key={`m-${key}`}
                  className={cx(
                    "rounded-lg border bg-white p-3 transition-colors",
                    isChecked(key)
                      ? "border-line"
                      : "border-dashed border-gray-300 bg-gray-50/60"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked(key)}
                        onChange={() => toggleOne(key)}
                        aria-label={`Выбрать ${i.sku} для оформления`}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#E53935]"
                      />
                      {/* Фото: клик открывает картинку, а не уводит со
                          страницы — по артикулу ниже переход в каталог. */}
                      <CartThumb item={i} onOpen={setLightboxSrc} />
                      <div className="min-w-0">
                        <button
                          onClick={() => openInCatalog(i.sku)}
                          title={`Открыть ${i.sku} в каталоге`}
                          className="text-left font-semibold text-ink hover:text-accent"
                        >
                          {i.sku}
                        </button>
                        <div className="line-clamp-2 text-[11px] text-muted">
                          {i.name}
                        </div>
                        {i.pairOnly && (
                          <div className="mt-0.5 text-[10px] font-semibold text-muted">
                            продаётся парами (шаг 2 шт)
                          </div>
                        )}
                        {i.warehouse && (
                          <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
                            <WarehouseIcon size={10} /> {i.warehouse}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(key)}
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
                        max={maxFor(i)}
                        onSet={(n) => setQty(key, n)}
                        onRemove={() => remove(key)}
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
                {/* Клиенту — применяемость, служебное имя из 1С он не
                    видит нигде (lib/product-title). */}
                <div className="text-[11px] text-muted">{g.row.fullName}</div>
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
                <th className="w-14">Фото</th>
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
                const key = itemKey(i);
                return (
                <tr key={key} className={cx(!isChecked(key) && "bg-gray-50/70")}>
                  <td>
                    <input
                      type="checkbox"
                      checked={isChecked(key)}
                      onChange={() => toggleOne(key)}
                      aria-label={`Выбрать ${i.sku} для оформления`}
                      className="h-4 w-4 accent-[#E53935]"
                    />
                  </td>
                  {/* Фото открывается на просмотр; уводит в каталог только
                      клик по артикулу. */}
                  <td>
                    <CartThumb item={i} onOpen={setLightboxSrc} />
                  </td>
                  <td>
                    <button
                      onClick={() => openInCatalog(i.sku)}
                      title={`Открыть ${i.sku} в каталоге`}
                      className="text-left font-semibold text-ink hover:text-accent"
                    >
                      {i.sku}
                    </button>
                    <div className="text-[11px] text-muted">{i.name}</div>
                    {i.pairOnly && (
                      <div className="mt-0.5 text-[10px] font-semibold text-muted">
                        продаётся парами (шаг 2 шт)
                      </div>
                    )}
                    {i.warehouse && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        <WarehouseIcon size={10} /> {i.warehouse}
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
                    {/* Same qty control as the mobile cards / catalog: draft
                        input (can be cleared while typing), shared caps. */}
                    <div className="mx-auto w-32">
                      <CartQtySelector
                        qty={i.qty}
                        step={step}
                        max={maxFor(i)}
                        onSet={(n) => setQty(key, n)}
                        onRemove={() => remove(key)}
                      />
                    </div>
                  </td>
                  <td className="text-right font-semibold text-ink">
                    {formatTenge(i.price * i.qty)}
                  </td>
                  <td>
                    <button
                      onClick={() => remove(key)}
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
                    <div className="text-[11px] text-muted">
                      {g.row.fullName}
                    </div>
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
              {kaspiReady ? (
                /* Клиенту с разрешением оплата идёт только через Kaspi —
                   выбирать нечего, поэтому вместо списка показываем сам
                   способ. Логотип официальный (public/kaspi). */
                <div className="flex items-center gap-2 rounded-lg border border-[#F14635]/40 bg-[#F14635]/5 px-3 py-2.5">
                  <span className="text-sm font-semibold text-ink">Оплата</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/kaspi/kaspi-logo.svg"
                    alt="Kaspi.kz"
                    width={208}
                    height={52}
                    className="h-5 w-auto shrink-0"
                  />
                </div>
              ) : (
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
              )}
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
              {deliveryMethod === "PICKUP" ? (
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  Заберёте заказ на складе самостоятельно.
                </p>
              ) : addresses.length > 0 ? (
                /* Адрес доставки — выбор из адресов клиента. Список ведёт
                   менеджер, поэтому в 1С уезжает выверенный адрес. */
                <div className="mt-2">
                  <label className="mb-1 block text-[11px] font-semibold text-ink">
                    Адрес доставки
                  </label>
                  {addresses.length === 1 ? (
                    <div className="rounded-lg border border-line bg-gray-50 px-3 py-2 text-[11px] leading-snug text-ink">
                      {[addresses[0].city, addresses[0].address]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {addresses.map((a) => (
                        <label
                          key={a.id}
                          className={cx(
                            "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-snug transition-colors",
                            addressId === a.id
                              ? "border-accent bg-accent/5 text-ink"
                              : "border-line text-muted hover:border-accent/40"
                          )}
                        >
                          <input
                            type="radio"
                            name="delivery-address"
                            checked={addressId === a.id}
                            onChange={() => setAddressId(a.id)}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#E53935]"
                          />
                          <span className="min-w-0">
                            {a.label && (
                              <span className="mr-1 font-semibold text-ink">
                                {a.label}:
                              </span>
                            )}
                            {[a.city, a.address].filter(Boolean).join(", ")}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] leading-snug text-muted">
                    Новый адрес добавит ваш менеджер.
                  </p>
                </div>
              ) : (
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  Адрес доставки не заполнен — обратитесь к вашему менеджеру.
                </p>
              )}
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
            // whitespace-pre-line: сервер перечисляет позиции, которых не
            // хватило на складе, по строкам.
            <div className="mb-3 whitespace-pre-line rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs leading-relaxed text-accent-dark">
              {error}
            </div>
          )}

          {noneChecked && (
            <div className="mb-3 rounded border border-line bg-gray-50 px-3 py-2 text-xs text-muted">
              Отметьте товары, которые хотите заказать.
            </div>
          )}
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={loading || noneChecked}
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
              // Kaspi Pay — имя, а не слово: строчными оно выглядит опечаткой.
              `Оплата: ${
                paymentMethod === "KASPI"
                  ? PAYMENT_LABELS.KASPI
                  : PAYMENT_LABELS[paymentMethod].toLowerCase()
              }, ` +
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
              removeMany(selected.map((i) => itemKey(i)));
              setUnchecked(new Set());
              setConfirmDelete(false);
            }}
          />
        </div>
      </div>

      {/* Фото товара во весь экран — тот же лайтбокс, что в каталоге. */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4"
        >
          <button
            onClick={() => setLightboxSrc(null)}
            aria-label="Закрыть"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg bg-white object-contain"
          />
        </div>
      )}
    </div>
  );
}
