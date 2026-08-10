"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pipette, RotateCcw, Warehouse as WarehouseIcon } from "lucide-react";
import {
  WAREHOUSE_PRESETS,
  badgeStyle,
  dotStyle,
  labelForColor,
  normalizeColor,
  resolveColor,
} from "@/lib/warehouse-colors";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Row = {
  id: string;
  name: string;
  color: string | null;
  defaultColor: string;
};

// Цвета складских плашек. До этого все склады были одинаково зелёными, и в
// строке из трёх складов клиент не различал их с одного взгляда. Цвет
// закреплён за складом, задаётся любым HEX (палитра, пипетка или код) и
// сбрасывается кнопкой к значению по умолчанию.
export default function WarehouseColors({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Что набрано в поле кода: код валиден не на каждом символе, поэтому
  // строка живёт отдельно от цвета склада.
  const [typed, setTyped] = useState<Record<string, string>>({});
  // Пипетка шлёт событие на каждое движение — сохраняем не чаще раза в 300мс.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetch("/api/admin/warehouses")
      .then((r) => r.json())
      .then((d) => setRows(d.warehouses ?? []))
      .catch(() => setError("Не удалось загрузить склады"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    []
  );

  function paint(id: string, color: string | null) {
    // Красим сразу — ответ сервера только подтверждает.
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, color } : r)));
  }

  async function save(id: string, color: string | null) {
    setSaving(id);
    setError(null);
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

  // Поле кода возвращается к показу текущего цвета. Ключ именно удаляем:
  // пустая строка — валидное «пользователь стёр код», и поле осталось бы
  // пустым.
  function clearTyped(id: string) {
    setTyped((t) => {
      if (!(id in t)) return t;
      const next = { ...t };
      delete next[id];
      return next;
    });
  }

  function setColor(id: string, color: string | null) {
    paint(id, color);
    clearTyped(id);
    save(id, color);
  }

  // Пипетка: цвет применяется мгновенно, запрос уходит после паузы.
  function setColorLive(id: string, color: string) {
    paint(id, color);
    clearTyped(id);
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => save(id, color), 300);
  }

  function commitTyped(id: string) {
    const value = typed[id];
    if (value == null) return;
    if (!value.trim()) {
      // Поле стёрли и ушли — показываем текущий цвет обратно.
      clearTyped(id);
      return;
    }
    const hex = normalizeColor(value);
    if (!hex) {
      setError("Некорректный код цвета — ожидается вид #1A2B3C");
      return;
    }
    setColor(id, hex);
  }

  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
        <WarehouseIcon size={16} className="text-accent" /> Цвета складов
      </div>
      <p className="mb-4 text-xs text-muted">
        Так склад выглядит в каталоге, избранном и корзине. Цвет любой: выберите
        из палитры, возьмите пипеткой или впишите код. Нулевой остаток всегда
        серый — это состояние товара, а не склада.
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
            const active = resolveColor(w.color, w.name);
            const isDefault = w.color == null;
            return (
              <div
                key={w.id}
                className="rounded-lg border border-line p-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* Живой пример плашки — виден результат до сохранения. */}
                  <span
                    className="badge border shrink-0"
                    style={badgeStyle(active)}
                  >
                    {w.name}:&nbsp;<b>12</b>
                  </span>

                  <span className="text-[11px] text-muted">
                    {labelForColor(active)}
                    {isDefault && " · по умолчанию"}
                  </span>

                  <div className="ml-auto flex items-center gap-2">
                    {saving === w.id && (
                      <Loader2 size={13} className="animate-spin text-muted" />
                    )}
                    <button
                      disabled={!canEdit || isDefault || saving === w.id}
                      onClick={() => setColor(w.id, null)}
                      title={
                        isDefault
                          ? "Уже стоит цвет по умолчанию"
                          : `Вернуть цвет по умолчанию (${labelForColor(
                              w.defaultColor
                            ).toLowerCase()})`
                      }
                      className="flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                    >
                      <RotateCcw size={12} /> Сбросить
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {WAREHOUSE_PRESETS.map((c) => {
                    const chosen = active === c.hex;
                    return (
                      <button
                        key={c.hex}
                        disabled={!canEdit}
                        onClick={() => setColor(w.id, c.hex)}
                        title={c.label}
                        aria-label={`${w.name}: ${c.label}`}
                        aria-pressed={chosen}
                        style={dotStyle(c.hex)}
                        className={cx(
                          "flex h-7 w-7 items-center justify-center rounded-full border-2 text-white transition-transform disabled:cursor-not-allowed",
                          chosen
                            ? "border-ink scale-110"
                            : "border-transparent hover:scale-105"
                        )}
                      >
                        {chosen && <Check size={13} strokeWidth={3} />}
                      </button>
                    );
                  })}

                  {/* Любой другой цвет: системная пипетка + код вручную. */}
                  <label
                    title="Выбрать любой цвет"
                    className={cx(
                      "relative ml-1 flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white",
                      canEdit
                        ? "cursor-pointer hover:border-ink"
                        : "cursor-not-allowed opacity-40"
                    )}
                  >
                    <Pipette size={13} className="text-ink" />
                    <input
                      type="color"
                      disabled={!canEdit}
                      value={active}
                      onChange={(e) => setColorLive(w.id, e.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label={`${w.name}: выбрать любой цвет`}
                    />
                  </label>

                  <input
                    type="text"
                    disabled={!canEdit}
                    value={typed[w.id] ?? active.toUpperCase()}
                    onChange={(e) =>
                      setTyped((t) => ({ ...t, [w.id]: e.target.value }))
                    }
                    // Код меняют целиком — иначе новый набирается внутрь старого.
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => commitTyped(w.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitTyped(w.id);
                      }
                    }}
                    spellCheck={false}
                    aria-label={`${w.name}: код цвета`}
                    className="ml-1 w-[92px] rounded border border-line px-2 py-1 text-[11px] uppercase tracking-wide text-ink outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </div>
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
