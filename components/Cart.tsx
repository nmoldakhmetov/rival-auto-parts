"use client";

import { useEffect, useState } from "react";
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
} from "lucide-react";
import { useCart, cartSum } from "@/store/cart";
import { formatTenge } from "@/lib/format";

type CheckoutResult = {
  orderNo: string;
  waLink: string | null;
  manager: { fullName: string; phone: string | null } | null;
};

export default function Cart() {
  const { items, setQty, remove, clear } = useCart();
  const [mounted, setMounted] = useState(false);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CheckoutResult | null>(null);

  useEffect(() => setMounted(true), []);

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
    return <div className="p-6 text-sm text-muted">Загрузка корзины…</div>;
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
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <ShoppingCart size={40} className="mx-auto mb-3 text-gray-300" />
        <h1 className="text-lg font-bold text-ink">Корзина пуста</h1>
        <p className="mb-5 text-sm text-muted">
          Добавьте товары из каталога, чтобы оформить заявку.
        </p>
        <Link href="/" className="btn-accent">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  const total = cartSum(items);

  // ─── Cart contents ─────────────────────────────────────────────────────
  return (
    <div className="px-6 py-6">
      <h1 className="mb-4 text-xl font-bold text-ink">
        Корзина{" "}
        <span className="text-sm font-normal text-muted">
          · {items.length} поз.
        </span>
      </h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Items */}
        <div className="overflow-hidden rounded-lg border border-line bg-white">
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
              {items.map((i) => (
                <tr key={i.productId}>
                  <td>
                    <div className="font-semibold text-ink">{i.sku}</div>
                    <div className="text-[11px] text-muted">{i.name}</div>
                  </td>
                  <td className="text-right">{formatTenge(i.price)}</td>
                  <td>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setQty(i.productId, i.qty - 1)}
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
                        onClick={() => setQty(i.productId, i.qty + 1)}
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
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="h-fit rounded-lg border border-line bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted">Итого</span>
            <span className="text-2xl font-bold text-ink">
              {formatTenge(total)}
            </span>
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий к заказу (необязательно)"
            rows={3}
            className="input mb-3 resize-none"
          />

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
