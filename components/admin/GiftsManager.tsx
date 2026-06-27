"use client";

import { useEffect, useRef, useState } from "react";
import {
  Gift,
  Search,
  X,
  Trash2,
  Pencil,
  Loader2,
  Save,
  Plus,
  Package,
  PackageCheck,
} from "lucide-react";

type ProductLite = {
  id: string;
  sku: string;
  name: string;
  fullName: string | null;
};
type Rule = {
  id: string;
  name: string | null;
  minQty: number;
  active: boolean;
  createdAt: string;
  triggers: ProductLite[];
  gifts: ProductLite[];
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// ─── Reusable product multi-picker ──────────────────────────────────────────
function ProductPicker({
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  items: ProductLite[];
  onAdd: (p: ProductLite) => void;
  onRemove: (id: string) => void;
  placeholder: string;
}) {
  const [pq, setPq] = useState("");
  const [results, setResults] = useState<ProductLite[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = pq.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(q)}&page=1`)
        .then((r) => r.json())
        .then((d) =>
          setResults(
            (d.rows ?? []).slice(0, 8).map((r: ProductLite) => ({
              id: r.id,
              sku: r.sku,
              name: r.name,
              fullName: r.fullName,
            }))
          )
        )
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [pq]);

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {items.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-gray-50 py-1 pl-2 pr-1 text-xs"
            >
              <span className="font-medium text-ink">{p.sku}</span>
              <span className="max-w-[160px] truncate text-muted">
                {p.fullName || p.name}
              </span>
              <button
                onClick={() => onRemove(p.id)}
                className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-red-50 hover:text-accent"
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={pq}
          onChange={(e) => setPq(e.target.value)}
          placeholder={placeholder}
          className="input pl-9"
        />
        {(results.length > 0 || searching) && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
            {searching && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
                <Loader2 size={13} className="animate-spin" /> Поиск…
              </div>
            )}
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onAdd(p);
                  setPq("");
                  setResults([]);
                }}
                className="flex w-full items-center gap-2 border-b border-line/60 px-3 py-2 text-left last:border-0 hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-ink">
                    {p.sku}
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    {p.fullName || p.name}
                  </div>
                </div>
                <Plus size={14} className="shrink-0 text-accent" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GiftsManager() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [minQty, setMinQty] = useState("3");
  const [triggers, setTriggers] = useState<ProductLite[]>([]);
  const [gifts, setGifts] = useState<ProductLite[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/gifts").then((r) => r.json());
      setRules(d.rules ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setMinQty("3");
    setTriggers([]);
    setGifts([]);
    setActive(true);
    setError("");
  }

  function startEdit(r: Rule) {
    setEditingId(r.id);
    setName(r.name ?? "");
    setMinQty(String(r.minQty));
    setTriggers(r.triggers);
    setGifts(r.gifts);
    setActive(r.active);
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const addUnique = (
    set: React.Dispatch<React.SetStateAction<ProductLite[]>>,
    p: ProductLite
  ) => set((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));

  async function save() {
    setError("");
    const n = parseInt(minQty, 10);
    if (!Number.isFinite(n) || n < 1) {
      setError("Минимальное количество должно быть от 1");
      return;
    }
    if (triggers.length === 0) {
      setError("Выберите хотя бы один товар-триггер");
      return;
    }
    if (gifts.length === 0) {
      setError("Выберите хотя бы один товар в подарок");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim() || null,
        minQty: n,
        triggerIds: triggers.map((p) => p.id),
        giftIds: gifts.map((p) => p.id),
        active,
      };
      const res = editingId
        ? await fetch(`/api/admin/gifts/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/gifts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Не удалось сохранить");
        return;
      }
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить подарочное правило?")) return;
    await fetch(`/api/admin/gifts/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    await load();
  }

  async function toggleActive(r: Rule) {
    setRules((rs) =>
      rs.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x))
    );
    await fetch(`/api/admin/gifts/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    }).catch(() => {});
  }

  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <Gift size={22} className="text-accent" /> Подарки за покупку
        </h1>
        <p className="mt-1 text-sm text-muted">
          При покупке от заданного количества любого из товаров-триггеров клиент
          получает выбранные товары в подарок — они автоматически добавляются в
          заказ с ценой 0.
        </p>
      </div>

      {/* ── Editor ─────────────────────────────────────────── */}
      <div
        ref={formRef}
        className="rounded-xl border border-line bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">
            {editingId ? "Редактирование правила" : "Новое правило"}
          </h2>
          {editingId && (
            <button
              onClick={resetForm}
              className="text-xs text-muted hover:text-accent"
            >
              Отменить редактирование
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                При покупке от <span className="text-accent">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={minQty}
                  onChange={(e) => setMinQty(e.target.value)}
                  className="input w-24"
                />
                <span className="text-sm text-muted">шт</span>
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-muted">
                Название (необязательно)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Тормозные колодки — подарок"
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Package size={14} /> Товары-триггеры (за их покупку даётся подарок)
            </label>
            <ProductPicker
              items={triggers}
              onAdd={(p) => addUnique(setTriggers, p)}
              onRemove={(id) =>
                setTriggers((prev) => prev.filter((p) => p.id !== id))
              }
              placeholder="Найти товар-триггер по артикулу или названию…"
            />
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
              <PackageCheck size={14} /> Товары в подарок (можно несколько)
            </label>
            <ProductPicker
              items={gifts}
              onAdd={(p) => addUnique(setGifts, p)}
              onRemove={(id) =>
                setGifts((prev) => prev.filter((p) => p.id !== id))
              }
              placeholder="Найти товар-подарок по артикулу или названию…"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Правило активно
          </label>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-accent">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="btn-accent">
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              {editingId ? "Сохранить изменения" : "Создать правило"}
            </button>
            {!editingId && (
              <button
                onClick={resetForm}
                className="text-xs text-muted hover:text-ink"
              >
                Очистить
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-ink">
          Подарочные правила ({rules.length})
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Загрузка…
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">
            Пока нет ни одного правила.
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className={cx(
                  "flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm",
                  r.active ? "border-line" : "border-line opacity-60"
                )}
              >
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Gift size={16} />
                  <span className="text-[10px] font-bold leading-none">
                    ≥{r.minQty}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  {r.name && (
                    <div className="text-sm font-bold text-ink">{r.name}</div>
                  )}
                  <div className="text-[12px] text-muted">
                    <span className="text-ink">Триггер:</span>{" "}
                    {r.triggers.map((p) => p.sku).join(", ") || "—"}
                  </div>
                  <div className="text-[12px] text-muted">
                    <span className="text-ink">Подарок:</span>{" "}
                    {r.gifts.map((p) => p.sku).join(", ") || "—"}
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(r)}
                  title={r.active ? "Выключить" : "Включить"}
                  className={cx(
                    "rounded-full px-2 py-1 text-[11px] font-medium transition-colors",
                    r.active
                      ? "bg-green-50 text-green-700 hover:bg-green-100"
                      : "bg-gray-100 text-muted hover:bg-gray-200"
                  )}
                >
                  {r.active ? "активно" : "выключено"}
                </button>
                <button
                  onClick={() => startEdit(r)}
                  title="Редактировать"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-ink"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => remove(r.id)}
                  title="Удалить"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-accent"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
