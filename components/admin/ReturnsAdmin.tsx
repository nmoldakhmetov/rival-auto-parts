"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { formatTenge, formatDateTime } from "@/lib/format";

type ReturnStatus = "NEW" | "PROCESSING" | "ACCEPTED" | "REJECTED";
type Row = {
  id: number;
  createdAt: string;
  code: string | null;
  sku: string;
  name: string;
  qty: number;
  price: number;
  sum: number;
  warehouseName: string | null;
  reason: string | null;
  comment: string | null;
  status: ReturnStatus;
  client: { fullName: string; login: string } | null;
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const STATUS_OPTIONS: { value: ReturnStatus; label: string }[] = [
  { value: "NEW", label: "Новый" },
  { value: "PROCESSING", label: "В обработке" },
  { value: "ACCEPTED", label: "Принят" },
  { value: "REJECTED", label: "Отклонён" },
];
const STATUS_CLS: Record<ReturnStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  PROCESSING: "bg-amber-50 text-amber-700 border-amber-200",
  ACCEPTED: "bg-green-50 text-green-700 border-green-200",
  REJECTED: "bg-gray-100 text-muted border-line",
};

export default function ReturnsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    params.set("page", String(page));
    fetch(`/api/admin/returns?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, q, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function changeStatus(id: number, s: ReturnStatus) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: s } : r)));
    await fetch(`/api/admin/returns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: s }),
    });
  }

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Возвраты</h1>
      <p className="mb-4 text-xs text-muted">
        Заявки на возврат от клиентов (в 1С не выгружаются).
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="input w-44"
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
            placeholder="Артикул, код, клиент…"
            className="input w-72 pl-9"
          />
        </div>
        {loading && <Loader2 size={16} className="animate-spin text-muted" />}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="data-table min-w-[1100px]">
          <thead>
            <tr>
              <th className="w-14">№</th>
              <th className="w-32">Дата</th>
              <th>Клиент</th>
              <th>Код</th>
              <th>Артикул</th>
              <th className="w-12 text-center">Кол.</th>
              <th className="w-28 text-right">Сумма</th>
              <th>Склад</th>
              <th>Причина</th>
              <th>Коммент.</th>
              <th className="w-40">Статус</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm text-muted">
                  Возвратов не найдено.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-bold text-ink">{r.id}</td>
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
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="text-[11px] text-muted">{r.code || "—"}</td>
                <td className="font-semibold text-ink">{r.sku}</td>
                <td className="text-center">{r.qty}</td>
                <td className="text-right font-semibold text-ink">
                  {formatTenge(r.sum)}
                </td>
                <td className="text-[11px] text-muted">
                  {r.warehouseName || "—"}
                </td>
                <td className="text-[11px] text-muted">{r.reason || "—"}</td>
                <td className="text-[11px] text-muted">{r.comment || "—"}</td>
                <td>
                  <select
                    value={r.status}
                    onChange={(e) =>
                      changeStatus(r.id, e.target.value as ReturnStatus)
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
