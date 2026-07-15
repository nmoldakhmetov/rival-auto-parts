"use client";

import { useEffect, useState } from "react";
import { Undo2, Loader2, Send, PackageX } from "lucide-react";
import { formatTenge, formatDateTime } from "@/lib/format";
import ConfirmDialog from "@/components/ConfirmDialog";

type OrderItem = {
  productId: string | null;
  sku: string;
  name: string;
  price: number;
};
type ReturnRow = {
  id: number;
  code: string | null;
  sku: string;
  name: string;
  qty: number;
  price: number;
  warehouseName: string | null;
  reason: string | null;
  comment: string | null;
  status: "NEW" | "PROCESSING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
};

const STATUS: Record<ReturnRow["status"], { label: string; cls: string }> = {
  NEW: { label: "Новый", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  PROCESSING: {
    label: "В обработке",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  ACCEPTED: {
    label: "Принят",
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  REJECTED: { label: "Отклонён", cls: "bg-gray-100 text-muted border-line" },
};

const REASONS = [
  "Деталь не подошла (ошибка подбора)",
  "Брак / дефект",
  "Не соответствует описанию",
  "Передумал",
  "Другое",
];

export default function ReturnsClient({
  orderItems,
  warehouses,
  embedded,
}: {
  orderItems: OrderItem[];
  warehouses: string[];
  // Rendered inside the «Мои заказы» tabs: no own page padding / heading.
  embedded?: boolean;
}) {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [itemKey, setItemKey] = useState("");
  const [qty, setQty] = useState("1");
  const [warehouseName, setWarehouseName] = useState(warehouses[0] ?? "");
  const [reason, setReason] = useState(REASONS[0]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // The submit button opens a confirmation dialog first (no accidental
  // return requests); the actual POST lives in doSubmit().
  const [confirmOpen, setConfirmOpen] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/returns")
      .then((r) => r.json())
      .then((d) => setReturns(d.returns ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const item = orderItems.find((i) => (i.productId ?? i.sku) === itemKey);
    if (!item) {
      setMsg("Выберите товар из ваших заказов");
      return;
    }
    setConfirmOpen(true);
  }

  async function doSubmit() {
    const item = orderItems.find((i) => (i.productId ?? i.sku) === itemKey);
    if (!item) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          qty: Math.max(1, parseInt(qty) || 1),
          warehouseName,
          reason,
          comment,
        }),
      });
      if (res.ok) {
        setItemKey("");
        setQty("1");
        setComment("");
        setMsg("Заявка на возврат создана");
        load();
      } else {
        const d = await res.json();
        setMsg(d.error || "Ошибка");
      }
    } catch {
      setMsg("Сервер недоступен");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={embedded ? undefined : "mx-auto max-w-5xl px-6 py-6"}>
      {!embedded && (
        <>
          <h1 className="mb-1 text-xl font-bold text-ink">Возвраты</h1>
          <p className="mb-5 text-xs text-muted">
            Оформление заявки на возврат по купленным товарам.
          </p>
        </>
      )}

      {/* New return */}
      <form
        onSubmit={submit}
        className="mb-6 rounded-xl border border-line bg-white p-5 shadow-sm"
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <Undo2 size={16} className="text-accent" /> Новая заявка на возврат
        </h2>

        {orderItems.length === 0 ? (
          <p className="text-sm text-muted">
            У вас пока нет купленных товаров для возврата.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Товар из заказов
              </label>
              <select
                value={itemKey}
                onChange={(e) => setItemKey(e.target.value)}
                className="input"
              >
                <option value="">— выберите товар —</option>
                {orderItems.map((i) => (
                  <option key={i.productId ?? i.sku} value={i.productId ?? i.sku}>
                    {i.sku} — {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Количество
              </label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Склад
              </label>
              <select
                value={warehouseName}
                onChange={(e) => setWarehouseName(e.target.value)}
                className="input"
              >
                {warehouses.length === 0 && <option value="">—</option>}
                {warehouses.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Причина возврата
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-semibold text-ink">
                Комментарий
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="input resize-none"
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="btn-accent"
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                Оформить возврат
              </button>
              {msg && <span className="text-xs text-muted">{msg}</span>}
              <ConfirmDialog
                open={confirmOpen}
                title="Заявка на возврат"
                text="Вы действительно хотите оформить заявку на возврат?"
                confirmLabel="Да"
                cancelLabel="Нет"
                onCancel={() => setConfirmOpen(false)}
                onConfirm={() => {
                  setConfirmOpen(false);
                  doSubmit();
                }}
              />
            </div>
          </div>
        )}
      </form>

      {/* My returns */}
      <h2 className="mb-3 text-sm font-bold text-ink">Мои возвраты</h2>
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-16">№</th>
              <th className="w-36">Дата</th>
              <th>Товар</th>
              <th className="w-16 text-center">Кол-во</th>
              <th className="w-28 text-right">Сумма</th>
              <th>Причина</th>
              <th className="w-28">Статус</th>
            </tr>
          </thead>
          <tbody>
            {!loading && returns.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <PackageX size={28} className="mx-auto mb-2 text-gray-300" />
                  <div className="text-sm text-muted">Возвратов пока нет</div>
                </td>
              </tr>
            )}
            {returns.map((r) => {
              const s = STATUS[r.status];
              return (
                <tr key={r.id}>
                  <td className="font-bold text-ink">{r.id}</td>
                  <td className="text-[11px] text-muted">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td>
                    <div className="font-semibold text-ink">{r.sku}</div>
                    <div className="text-[11px] text-muted">{r.name}</div>
                  </td>
                  <td className="text-center">{r.qty}</td>
                  <td className="text-right font-semibold text-ink">
                    {formatTenge(r.price * r.qty)}
                  </td>
                  <td className="text-[11px] text-muted">{r.reason || "—"}</td>
                  <td>
                    <span className={`badge border ${s.cls}`}>{s.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
