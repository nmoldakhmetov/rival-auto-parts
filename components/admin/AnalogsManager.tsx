"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  TriangleAlert,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
} from "lucide-react";
import { formatNum } from "@/lib/format";

type Analog = { id: string; code: string; brand: string | null; sku: string };
type ImportResult = {
  ok: boolean;
  rows: number;
  imported: number;
  durationMs: number;
  error?: string;
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export default function AnalogsManager({
  initialTotal,
}: {
  initialTotal: number;
}) {
  const [total, setTotal] = useState(initialTotal);

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [rows, setRows] = useState<Analog[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ code: "", brand: "", sku: "" });

  const [addForm, setAddForm] = useState({ code: "", brand: "", sku: "" });
  const [adding, setAdding] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("page", String(page));
    fetch(`/api/admin/analogs?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setListTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, page]);

  useEffect(() => {
    const t = setTimeout(loadList, 250);
    return () => clearTimeout(t);
  }, [loadList]);

  async function doImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/analogs/import", {
        method: "POST",
        body: fd,
      });
      const data: ImportResult = await res.json();
      setImportResult(data);
      if (data.ok) {
        setTotal(data.imported);
        setPage(1);
        loadList();
      }
    } catch {
      setImportResult({
        ok: false,
        rows: 0,
        imported: 0,
        durationMs: 0,
        error: "Сервер недоступен или файл слишком большой",
      });
    } finally {
      setImporting(false);
    }
  }

  async function addAnalog(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.code.trim() || !addForm.sku.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/analogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      if (res.ok) {
        setAddForm({ code: "", brand: "", sku: "" });
        setTotal((t) => t + 1);
        loadList();
      }
    } finally {
      setAdding(false);
    }
  }

  function startEdit(a: Analog) {
    setEditId(a.id);
    setEditForm({ code: a.code, brand: a.brand ?? "", sku: a.sku });
  }
  async function saveEdit() {
    if (!editId) return;
    await fetch(`/api/admin/analogs/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditId(null);
    loadList();
  }
  async function del(id: string) {
    await fetch(`/api/admin/analogs/${id}`, { method: "DELETE" });
    setTotal((t) => Math.max(0, t - 1));
    loadList();
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="mb-1 flex items-end justify-between">
        <h1 className="text-xl font-bold text-ink">Аналоги</h1>
        <span className="text-xs text-muted">
          Всего в базе:{" "}
          <span className="font-semibold text-ink">{formatNum(total)}</span>
        </span>
      </div>
      <p className="mb-5 text-xs text-muted">
        Кросс-ссылки «номер аналога → артикул в каталоге». Поиск по номеру
        аналога подставит товар с привязанным артикулом.
      </p>

      {/* Import */}
      <div className="mb-6 rounded-xl border border-line bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-accent" />
          <h2 className="text-sm font-bold text-ink">Импорт из .xlsx</h2>
        </div>

        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          Импорт <b>полностью очищает</b> базу аналогов и пересобирает её по
          новому файлу. Используются первые 3 колонки: <b>код</b>, <b>бренд</b>,{" "}
          <b>артикул</b>.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-ghost cursor-pointer">
            <Upload size={16} />
            Выбрать файл
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
          </label>
          {fileName && (
            <span className="max-w-xs truncate text-xs text-muted">
              {fileName}
            </span>
          )}
          <button
            onClick={doImport}
            disabled={importing || !fileName}
            className="btn-accent"
          >
            {importing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            {importing ? "Импорт…" : "Импортировать"}
          </button>
        </div>

        {importResult && (
          <div
            className={cx(
              "mt-3 rounded-lg border px-3 py-2 text-xs",
              importResult.ok
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-accent/30 bg-accent/5 text-accent-dark"
            )}
          >
            {importResult.ok ? (
              <span className="flex items-center gap-2">
                <CheckCircle2 size={14} /> Импортировано{" "}
                <b>{formatNum(importResult.imported)}</b> аналогов из{" "}
                {formatNum(importResult.rows)} строк за{" "}
                {importResult.durationMs} мс.
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <XCircle size={14} /> Ошибка: {importResult.error}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Add + search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={addAnalog} className="flex flex-wrap items-center gap-2">
          <input
            value={addForm.code}
            onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
            placeholder="Код аналога"
            className="input w-40"
          />
          <input
            value={addForm.brand}
            onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })}
            placeholder="Бренд"
            className="input w-32"
          />
          <input
            value={addForm.sku}
            onChange={(e) => setAddForm({ ...addForm, sku: e.target.value })}
            placeholder="Артикул товара"
            className="input w-40"
          />
          <button type="submit" disabled={adding} className="btn-accent">
            <Plus size={16} /> Добавить
          </button>
        </form>

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
            placeholder="Поиск по коду / артикулу…"
            className="input w-64 pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th className="w-1/3">Код аналога</th>
              <th className="w-1/4">Бренд</th>
              <th>Артикул товара (sku)</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-12 text-center text-sm text-muted">
                  {total === 0
                    ? "База аналогов пуста — импортируйте .xlsx."
                    : "Ничего не найдено."}
                </td>
              </tr>
            )}
            {rows.map((a) =>
              editId === a.id ? (
                <tr key={a.id} className="bg-amber-50/40">
                  <td>
                    <input
                      value={editForm.code}
                      onChange={(e) =>
                        setEditForm({ ...editForm, code: e.target.value })
                      }
                      className="input py-1 text-xs"
                    />
                  </td>
                  <td>
                    <input
                      value={editForm.brand}
                      onChange={(e) =>
                        setEditForm({ ...editForm, brand: e.target.value })
                      }
                      className="input py-1 text-xs"
                    />
                  </td>
                  <td>
                    <input
                      value={editForm.sku}
                      onChange={(e) =>
                        setEditForm({ ...editForm, sku: e.target.value })
                      }
                      className="input py-1 text-xs"
                    />
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={saveEdit}
                        title="Сохранить"
                        className="flex h-7 w-7 items-center justify-center rounded bg-accent text-white hover:bg-accent-dark"
                      >
                        <Save size={14} />
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        title="Отмена"
                        className="flex h-7 w-7 items-center justify-center rounded border border-line text-muted hover:bg-gray-50"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={a.id}>
                  <td className="font-semibold text-ink">{a.code}</td>
                  <td className="text-muted">{a.brand || "—"}</td>
                  <td className="font-medium text-ink">{a.sku}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => startEdit(a)}
                        title="Изменить"
                        className="flex h-7 w-7 items-center justify-center rounded border border-line text-muted hover:bg-gray-50 hover:text-ink"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => del(a.id)}
                        title="Удалить"
                        className="flex h-7 w-7 items-center justify-center rounded border border-line text-muted hover:bg-accent/10 hover:text-accent"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>

        {listTotal > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs">
            <span className="text-muted">
              Найдено: <b className="text-ink">{formatNum(listTotal)}</b>
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
