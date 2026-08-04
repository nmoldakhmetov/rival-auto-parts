"use client";

import { useEffect, useRef, useState } from "react";
import {
  Percent,
  Search,
  X,
  Trash2,
  Pencil,
  Loader2,
  Users,
  Globe,
  Save,
  Plus,
  Tag,
  Boxes,
  Car,
  Package,
  BadgePercent,
} from "lucide-react";

type Client = {
  id: string;
  fullName: string;
  login: string;
  city: string | null;
};
type ProductLite = {
  id: string;
  sku: string;
  name: string;
  fullName: string | null;
};
type Target = "ALL" | "PRODUCT" | "CATEGORY" | "BRAND";
type Kind = "DISCOUNT" | "MARKUP";
type Rule = {
  id: string;
  name: string | null;
  kind: Kind;
  percent: number;
  userId: string | null;
  clientName: string | null;
  clientLogin: string | null;
  target: Target;
  category: string | null;
  brand: string | null;
  active: boolean;
  createdAt: string;
  products: ProductLite[];
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const TARGET_META: Record<
  Target,
  { label: string; Icon: typeof Tag }
> = {
  ALL: { label: "На все товары", Icon: Boxes },
  PRODUCT: { label: "На конкретные товары", Icon: Package },
  CATEGORY: { label: "На категорию", Icon: Tag },
  BRAND: { label: "На марку/бренд", Icon: Car },
};

// Выбор клиента с поиском. Обычный <select> на боевой базе (650+ клиентов)
// превращался в бесконечный список, в котором нужного было не найти.
function ClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const picked = clients.find((c) => c.id === value) ?? null;
  // Список виден и когда в поле что-то набрано: иначе, потеряв фокус, можно
  // остаться с запросом и без подсказок.
  const open = focused || q.trim() !== "";

  const needle = q.trim().toLowerCase();
  const found = needle
    ? clients.filter((c) =>
        [c.fullName, c.login, c.city ?? ""].some((f) =>
          f.toLowerCase().includes(needle)
        )
      )
    : clients;
  // Список режем: рисовать все 650 строк в выпадашке незачем.
  const shown = found.slice(0, 50);

  if (picked && !open) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
        <Users size={14} className="shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">
            {picked.fullName}
          </div>
          <div className="truncate text-[11px] text-muted">
            {picked.login}
            {picked.city ? ` · ${picked.city}` : ""}
          </div>
        </div>
        <button
          onClick={() => {
            onChange("");
            setQ("");
            setFocused(true);
          }}
          title="Выбрать другого клиента"
          className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-white hover:text-accent"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Поиск клиента: ФИО, логин или город…"
        className="input pl-9"
      />
      {open && (
        // preventDefault на mousedown держит фокус в поле, иначе onBlur
        // закрыл бы список раньше, чем сработал клик по строке.
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {shown.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted">
              Никого не нашли — проверьте написание.
            </div>
          ) : (
            <>
              {shown.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onChange(c.id);
                    setFocused(false);
                    setQ("");
                  }}
                  className="flex w-full flex-col items-start px-3 py-1.5 text-left transition-colors hover:bg-gray-50"
                >
                  <span className="text-sm text-ink">{c.fullName}</span>
                  <span className="text-[11px] text-muted">
                    {c.login}
                    {c.city ? ` · ${c.city}` : ""}
                  </span>
                </button>
              ))}
              {found.length > shown.length && (
                <div className="px-3 py-1.5 text-[11px] text-muted">
                  …и ещё {found.length - shown.length}. Уточните запрос.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiscountsManager({
  clients,
  ownClientsOnly = false,
}: {
  clients: Client[];
  ownClientsOnly?: boolean;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [makes, setMakes] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("DISCOUNT");
  const [percent, setPercent] = useState("10");
  const [toAll, setToAll] = useState(!ownClientsOnly); // true = всем клиентам
  const [clientId, setClientId] = useState("");
  const [target, setTarget] = useState<Target>("ALL");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  // product search
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<ProductLite[]>([]);
  const [psearching, setPsearching] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/discounts").then((r) => r.json());
      setRules(d.rules ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    fetch("/api/products/filters")
      .then((r) => r.json())
      .then((d) => {
        setMakes(d.makes ?? []);
        setCategories(d.categories ?? []);
      })
      .catch(() => {});
  }, []);

  // Debounced product search.
  useEffect(() => {
    const q = pq.trim();
    if (q.length < 2) {
      setPresults([]);
      return;
    }
    setPsearching(true);
    const t = setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(q)}&page=1`)
        .then((r) => r.json())
        .then((d) =>
          setPresults(
            (d.rows ?? []).slice(0, 8).map((r: ProductLite) => ({
              id: r.id,
              sku: r.sku,
              name: r.name,
              fullName: r.fullName,
            }))
          )
        )
        .catch(() => setPresults([]))
        .finally(() => setPsearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [pq]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setKind("DISCOUNT");
    setPercent("10");
    setToAll(!ownClientsOnly);
    setClientId("");
    setTarget("ALL");
    setCategory("");
    setBrand("");
    setProducts([]);
    setActive(true);
    setPq("");
    setPresults([]);
    setError("");
  }

  function startEdit(r: Rule) {
    setEditingId(r.id);
    setName(r.name ?? "");
    setKind(r.kind ?? "DISCOUNT");
    setPercent(String(r.percent));
    setToAll(!r.userId);
    setClientId(r.userId ?? "");
    setTarget(r.target);
    setCategory(r.category ?? "");
    setBrand(r.brand ?? "");
    setProducts(r.products);
    setActive(r.active);
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Активные правила выбранного клиента — показываем прямо в форме, чтобы
  // не выдавали вторую скидку поверх существующей.
  const clientRules = clientId
    ? rules.filter((r) => r.userId === clientId && r.active)
    : [];

  function addProduct(p: ProductLite) {
    setProducts((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
    setPq("");
    setPresults([]);
  }
  function removeProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  async function save() {
    setError("");
    const pct = parseInt(percent, 10);
    if (!Number.isFinite(pct) || pct < 1 || pct > 95) {
      setError(
        kind === "MARKUP"
          ? "Процент наценки должен быть от 1 до 95"
          : "Процент скидки должен быть от 1 до 95"
      );
      return;
    }
    if (!toAll && !clientId) {
      setError("Выберите клиента");
      return;
    }
    if (target === "CATEGORY" && !category) {
      setError("Выберите категорию");
      return;
    }
    if (target === "BRAND" && !brand) {
      setError("Выберите марку/бренд");
      return;
    }
    if (target === "PRODUCT" && products.length === 0) {
      setError("Выберите хотя бы один товар");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim() || null,
        kind,
        percent: pct,
        userId: toAll ? null : clientId,
        target,
        category: target === "CATEGORY" ? category : null,
        brand: target === "BRAND" ? brand : null,
        productIds: target === "PRODUCT" ? products.map((p) => p.id) : [],
        active,
      };
      const res = editingId
        ? await fetch(`/api/admin/discounts/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/discounts", {
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
    if (!confirm("Удалить правило?")) return;
    await fetch(`/api/admin/discounts/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    await load();
  }

  async function toggleActive(r: Rule) {
    setRules((rs) =>
      rs.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x))
    );
    await fetch(`/api/admin/discounts/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    }).catch(() => {});
  }

  function ruleTargetText(r: Rule) {
    if (r.target === "ALL") return "на все товары";
    if (r.target === "CATEGORY") return `категория «${r.category}»`;
    if (r.target === "BRAND") return `марка «${r.brand}»`;
    return `товары: ${r.products.map((p) => p.sku).join(", ") || "—"}`;
  }

  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <Percent size={22} className="text-accent" /> Скидки
        </h1>
        <p className="mt-1 text-sm text-muted">
          Скидки (−%) и наценки (+%) всем клиентам или конкретному клиенту — на
          весь каталог, отдельные товары, категорию или марку. Из подходящих
          правил каждого типа берётся наибольшее; итог = скидка минус наценка.
          Наценка, в отличие от скидки, действует и на товары с финальной ценой
          из 1С.
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
          {/* kind: discount / markup */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Тип правила
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setKind("DISCOUNT")}
                className={cx(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  kind === "DISCOUNT"
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line text-muted hover:border-accent/40"
                )}
              >
                Скидка&nbsp;
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  −%
                </span>
              </button>
              <button
                onClick={() => setKind("MARKUP")}
                className={cx(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  kind === "MARKUP"
                    ? "border-ink bg-ink/5 text-ink"
                    : "border-line text-muted hover:border-ink/40"
                )}
              >
                Наценка&nbsp;
                <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  +%
                </span>
              </button>
            </div>
            {kind === "MARKUP" && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-700">
                Наценка применяется ко всем товарам, включая позиции с финальной
                ценой из 1С (у которых скидки не действуют). Клиент увидит уже
                повышенную цену без пометок.
              </p>
            )}
          </div>

          {/* percent + name */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                {kind === "MARKUP" ? "Размер наценки" : "Размер скидки"}{" "}
                <span className="text-accent">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={95}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="input w-24"
                />
                <span className="text-sm text-muted">%</span>
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-muted">
                Название (необязательно)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Постоянный клиент"
                className="input"
              />
            </div>
          </div>

          {/* scope */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Кому
            </label>
            {!ownClientsOnly && (
              <div className="mb-2 flex gap-2">
                <button
                  onClick={() => setToAll(true)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    toAll
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-muted hover:border-accent/40"
                  )}
                >
                  <Globe size={14} /> Всем клиентам
                </button>
                <button
                  onClick={() => setToAll(false)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    !toAll
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-muted hover:border-accent/40"
                  )}
                >
                  <Users size={14} /> Конкретному клиенту
                </button>
              </div>
            )}
            {!toAll && (
              <ClientPicker
                clients={clients}
                value={clientId}
                onChange={setClientId}
              />
            )}
            {/* Уже действующие правила выбранного клиента: менеджер видит,
                что скидка есть, и правит её, а не выдаёт вторую. */}
            {!toAll && clientId && clientRules.length > 0 && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <div className="mb-1 flex items-center gap-1.5 font-semibold">
                  <BadgePercent size={12} />
                  У клиента уже есть активные правила:
                </div>
                <ul className="space-y-0.5">
                  {clientRules.map((r) => (
                    <li key={r.id} className="flex items-center gap-1.5">
                      <span className="font-semibold">
                        {r.kind === "MARKUP" ? `+${r.percent}%` : `−${r.percent}%`}
                      </span>
                      <span>{TARGET_META[r.target].label.toLowerCase()}</span>
                      {r.category && <span>· {r.category}</span>}
                      {r.brand && <span>· {r.brand}</span>}
                      {r.id !== editingId && (
                        <button
                          onClick={() => startEdit(r)}
                          className="ml-auto shrink-0 font-semibold underline hover:no-underline"
                        >
                          изменить
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* target */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              На что
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {(Object.keys(TARGET_META) as Target[]).map((t) => {
                const { label, Icon } = TARGET_META[t];
                return (
                  <button
                    key={t}
                    onClick={() => setTarget(t)}
                    className={cx(
                      "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      target === t
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-line text-muted hover:border-accent/40"
                    )}
                  >
                    <Icon size={14} /> {label}
                  </button>
                );
              })}
            </div>

            {target === "CATEGORY" && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input"
              >
                <option value="">— выберите категорию —</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            {target === "BRAND" && (
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="input"
              >
                <option value="">— выберите марку —</option>
                {makes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}

            {target === "PRODUCT" && (
              <div>
                {products.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {products.map((p) => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-lg border border-line bg-gray-50 py-1 pl-2 pr-1 text-xs"
                      >
                        <span className="font-medium text-ink">{p.sku}</span>
                        <span className="max-w-[160px] truncate text-muted">
                          {p.fullName || p.name}
                        </span>
                        <button
                          onClick={() => removeProduct(p.id)}
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
                    placeholder="Найти товар по артикулу или названию…"
                    className="input pl-9"
                  />
                  {(presults.length > 0 || psearching) && (
                    <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
                      {psearching && (
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
                          <Loader2 size={13} className="animate-spin" /> Поиск…
                        </div>
                      )}
                      {presults.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addProduct(p)}
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
            )}
          </div>

          {/* active */}
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
          Действующие правила ({rules.length})
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Загрузка…
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">
            Пока нет ни одной скидки.
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => {
              const { Icon } = TARGET_META[r.target];
              return (
                <div
                  key={r.id}
                  className={cx(
                    "flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm",
                    r.active ? "border-line" : "border-line opacity-60"
                  )}
                >
                  <div
                    className={cx(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold",
                      r.kind === "MARKUP"
                        ? "bg-ink/10 text-ink"
                        : "bg-accent/10 text-accent"
                    )}
                    title={r.kind === "MARKUP" ? "Наценка" : "Скидка"}
                  >
                    {r.kind === "MARKUP" ? "+" : "−"}
                    {r.percent}%
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.name && (
                        <span className="text-sm font-bold text-ink">
                          {r.name}
                        </span>
                      )}
                      <span
                        className={cx(
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          r.userId
                            ? "bg-violet-50 text-violet-600"
                            : "bg-blue-50 text-blue-600"
                        )}
                      >
                        {r.userId ? (
                          <>
                            <Users size={11} /> {r.clientName ?? "клиент"}
                          </>
                        ) : (
                          <>
                            <Globe size={11} /> всем клиентам
                          </>
                        )}
                      </span>
                      <span className="flex items-center gap-1 text-[12px] text-muted">
                        <Icon size={12} /> {ruleTargetText(r)}
                      </span>
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
                    {r.active ? "активна" : "выключена"}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
