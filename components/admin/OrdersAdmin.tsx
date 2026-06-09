"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { formatTenge, formatDateTime } from "@/lib/format";

type OrderStatus =
  | "NEW"
  | "SENT"
  | "PROCESSING"
  | "OUT_OF_STOCK"
  | "ISSUED"
  | "COMPLETED"
  | "CANCELLED";

type Row = {
  id: string;
  orderNo: string;
  createdAt: string;
  status: OrderStatus;
  total: number;
  paid: number;
  debt: number;
  itemsCount: number;
  client: { fullName: string; email: string | null; login: string } | null;
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "NEW", label: "Заказ принят" },
  { value: "PROCESSING", label: "В работе" },
  { value: "OUT_OF_STOCK", label: "Нет в наличии" },
  { value: "ISSUED", label: "Выдано" },
  { value: "CANCELLED", label: "Отказ клиента" },
  { value: "SENT", label: "Отправлен" },
  { value: "COMPLETED", label: "Выполнен" },
];
const STATUS_CLS: Record<OrderStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  SENT: "bg-amber-50 text-amber-700 border-amber-200",
  PROCESSING: "bg-purple-50 text-purple-700 border-purple-200",
  OUT_OF_STOCK: "bg-orange-50 text-orange-700 border-orange-200",
  ISSUED: "bg-green-50 text-green-700 border-green-200",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-gray-100 text-muted border-line",
};

export default function OrdersAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sums, setSums] = useState({ total: 0, paid: 0, debt: 0 });
  const [loading, setLoading] = useState(true);
  const [payEdit, setPayEdit] = useState<{ id: string; val: string } | null>(
    null
  );

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    params.set("page", String(page));
    fetch(`/api/admin/orders?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? 1);
        setSums(d.sums ?? { total: 0, paid: 0, debt: 0 });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, q, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function changeStatus(id: string, newStatus: OrderStatus) {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    );
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function savePaid(id: string, paid: number) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === id ? { ...r, paid, debt: r.total - paid } : r
      )
    );
    setPayEdit(null);
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid }),
    });
  }

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Заказы</h1>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted">
        <span>
          Всего заказов: <b className="text-ink">{total}</b>
        </span>
        <span>
          Сумма: <b className="text-ink">{formatTenge(sums.total)}</b>
        </span>
        <span>
          Оплачено: <b className="text-green-700">{formatTenge(sums.paid)}</b>
        </span>
        <span>
          Долг: <b className="text-accent">{formatTenge(sums.debt)}</b>
        </span>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="input w-48"
        >
          <option value="">Все статусы</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Клиент, логин или email…"
            className="input w-72 pl-9"
          />
        </div>
        {loading && <Loader2 size={16} className="animate-spin text-muted" />}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-24">№</th>
              <th className="w-36">Дата</th>
              <th>Клиент</th>
              <th className="w-16 text-center">Поз.</th>
              <th className="w-28 text-right">Сумма</th>
              <th className="w-32 text-right">Оплачено</th>
              <th className="w-28 text-right">Долг</th>
              <th className="w-44">Статус</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-muted">
                  Заказов не найдено.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-bold text-ink">№{r.orderNo}</td>
                <td className="text-[11px] text-muted">
                  {formatDateTime(r.createdAt)}
                </td>
                <td>
                  {r.client ? (
                    <>
                      <div className="font-medium text-ink">
                        {r.client.fullName}
                      </div>
                      <div className="text-[11px] text-muted">
                        {r.client.login}
                        {r.client.email ? ` · ${r.client.email}` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="text-center text-muted">{r.itemsCount}</td>
                <td className="text-right font-semibold text-ink">
                  {formatTenge(r.total)}
                </td>
                <td className="text-right">
                  {payEdit?.id === r.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        value={payEdit.val}
                        onChange={(e) =>
                          setPayEdit({ id: r.id, val: e.target.value })
                        }
                        className="input w-24 py-1 text-xs"
                        autoFocus
                      />
                      <button
                        onClick={() =>
                          savePaid(r.id, Math.max(0, Number(payEdit.val) || 0))
                        }
                        className="flex h-6 w-6 items-center justify-center rounded bg-accent text-white"
                      >
                        <Save size={12} />
                      </button>
                      <button
                        onClick={() => setPayEdit(null)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-line text-muted"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        setPayEdit({ id: r.id, val: String(r.paid) })
                      }
                      className="group/p inline-flex items-center gap-1 text-green-700"
                      title="Изменить оплату"
                    >
                      {formatTenge(r.paid)}
                      <Pencil
                        size={11}
                        className="text-gray-300 opacity-0 group-hover/p:opacity-100"
                      />
                    </button>
                  )}
                </td>
                <td
                  className={cx(
                    "text-right font-semibold",
                    r.debt > 0 ? "text-accent" : "text-muted"
                  )}
                >
                  {formatTenge(r.debt)}
                </td>
                <td>
                  <select
                    value={r.status}
                    onChange={(e) =>
                      changeStatus(r.id, e.target.value as OrderStatus)
                    }
                    className={cx(
                      "w-full rounded border px-2 py-1 text-xs font-medium outline-none",
                      STATUS_CLS[r.status]
                    )}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs">
            <span className="text-muted">
              Всего: <b className="text-ink">{total}</b>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-7 w-7 items-center justify-center rounded border border-line disabled:opacity-40"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex h-7 w-7 items-center justify-center rounded border border-line disabled:opacity-40"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
