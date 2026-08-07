"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Warehouse as WarehouseIcon } from "lucide-react";
import {
  WAREHOUSE_COLORS,
  colorByKey,
  type WarehouseColorKey,
} from "@/lib/warehouse-colors";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Row = {
  id: string;
  name: string;
  color: string | null;
  defaultColor: WarehouseColorKey;
};

// Цвета складских плашек. До этого все склады были одинаково зелёными, и в
// строке из трёх складов клиент не различал их с одного взгляда. Цвет
// закреплён за складом; кнопка возвращает склад к цвету по умолчанию.
export default function WarehouseColors({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/warehouses")
      .then((r) => r.json())
      .then((d) => setRows(d.warehouses ?? []))
      .catch(() => setError("Не удалось загрузить склады"))
      .finally(() => setLoading(false));
  }, []);

  async function setColor(id: string, color: string | null) {
    setSaving(id);
    setError(null);
    // Красим сразу — ответ сервера только подтверждает.
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, color } : r)));
    try {
      const res = await fetch("/api/admin/warehouses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, color }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Не удалось сохранить цвет");
      }
    } catch {
      setError("Сервер недоступен. Повторите попытку.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
        <WarehouseIcon size={16} className="text-accent" /> Цвета складов
      </div>
      <p className="mb-4 text-xs text-muted">
        Так склад выглядит в каталоге, избранном и корзине. Нулевой остаток
        всегда серый — это состояние товара, а не склада.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted">
          Складов пока нет — они появятся после синхронизации с 1С.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((w) => {
            const active = (w.color ?? w.defaultColor) as WarehouseColorKey;
            const isDefault = w.color == null;
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line p-3"
              >
                {/* Живой пример плашки — виден результат до сохранения. */}
                <span
                  className={cx(
                    "badge border shrink-0",
                    colorByKey(active).badge
                  )}
                >
                  {w.name}:&nbsp;<b>12</b>
                </span>

                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {WAREHOUSE_COLORS.map((c) => (
                    <button
                      key={c.key}
                      disabled={!canEdit || saving === w.id}
                      onClick={() => setColor(w.id, c.key)}
                      title={c.label}
                      aria-label={`${w.name}: ${c.label}`}
                      className={cx(
                        "h-7 w-7 rounded-full border-2 transition-transform disabled:cursor-not-allowed",
                        c.dot,
                        active === c.key
                          ? "border-ink scale-110"
                          : "border-transparent hover:scale-105"
                      )}
                    />
                  ))}
                </div>

                <button
                  disabled={!canEdit || isDefault || saving === w.id}
                  onClick={() => setColor(w.id, null)}
                  title={
                    isDefault
                      ? "Уже стоит цвет по умолчанию"
                      : `Вернуть цвет по умолчанию (${colorByKey(w.defaultColor).label.toLowerCase()})`
                  }
                  className="flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                >
                  <RotateCcw size={12} /> Сбросить
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error && <div className="mt-2 text-xs text-accent">{error}</div>}
      {!canEdit && (
        <p className="mt-3 text-[11px] text-muted">
          Менять цвета может администратор.
        </p>
      )}
    </div>
  );
}
