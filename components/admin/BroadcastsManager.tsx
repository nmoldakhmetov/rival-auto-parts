"use client";

import { useEffect, useRef, useState } from "react";
import {
  Megaphone,
  Plus,
  Search,
  X,
  Trash2,
  Pencil,
  Send,
  Loader2,
  Users,
  Globe,
  CheckCircle2,
} from "lucide-react";
import { formatTenge } from "@/lib/format";

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
  price: number;
  imageUrl: string | null;
  badge?: "NEW" | "HIT" | null;
};
type BroadcastItem = {
  id: string;
  title: string | null;
  text: string;
  isGlobal: boolean;
  createdAt: string;
  products: ProductLite[];
  recipientCount: number | null;
  readCount: number;
  recipientIds: string[];
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export default function BroadcastsManager({
  clients,
  ownClientsOnly = false,
}: {
  clients: Client[];
  ownClientsOnly?: boolean;
}) {
  const [list, setList] = useState<BroadcastItem[]>([]);
  const [loading, setLoading] = useState(true);

  // form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [isGlobal, setIsGlobal] = useState(!ownClientsOnly);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [clientIds, setClientIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  // product search
  const [pq, setPq] = useState("");
  const [presults, setPresults] = useState<ProductLite[]>([]);
  const [psearching, setPsearching] = useState(false);

  // client filter
  const [cq, setCq] = useState("");

  async function load() {
    setLoading(true);
    try {
      const d = await fetch("/api/admin/broadcasts").then((r) => r.json());
      setList(d.broadcasts ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
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
              price: r.price,
              imageUrl: r.imageUrl,
              badge: r.badge,
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
    setTitle("");
    setText("");
    setIsGlobal(!ownClientsOnly);
    setProducts([]);
    setClientIds(new Set());
    setPq("");
    setPresults([]);
    setCq("");
    setError("");
  }

  function startEdit(b: BroadcastItem) {
    setEditingId(b.id);
    setTitle(b.title ?? "");
    setText(b.text);
    setIsGlobal(b.isGlobal);
    setProducts(b.products);
    setClientIds(new Set(b.recipientIds));
    setError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addProduct(p: ProductLite) {
    setProducts((prev) =>
      prev.some((x) => x.id === p.id) ? prev : [...prev, p]
    );
    setPq("");
    setPresults([]);
  }
  function removeProduct(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }
  function toggleClient(id: string) {
    setClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setError("");
    if (!text.trim()) {
      setError("Введите текст рассылки");
      return;
    }
    if (!isGlobal && clientIds.size === 0) {
      setError("Выберите получателей или включите «всем клиентам»");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim() || null,
        text: text.trim(),
        isGlobal,
        productIds: products.map((p) => p.id),
        userIds: isGlobal ? [] : [...clientIds],
      };
      const res = editingId
        ? await fetch(`/api/admin/broadcasts/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/broadcasts", {
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
    if (!confirm("Удалить рассылку? Её больше не увидят клиенты.")) return;
    await fetch(`/api/admin/broadcasts/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    await load();
  }

  const filteredClients = clients.filter((c) => {
    const q = cq.trim().toLowerCase();
    if (!q) return true;
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.login.toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 px-6 py-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <Megaphone size={22} className="text-accent" /> Рассылки клиентам
        </h1>
        <p className="mt-1 text-sm text-muted">
          Всплывающие новости и акции с карточками товаров. Сохраняются у
          клиента — он может открыть их повторно через колокольчик.
        </p>
      </div>

      {/* ── Editor ─────────────────────────────────────────── */}
      <div
        ref={formRef}
        className="rounded-xl border border-line bg-white p-5 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">
            {editingId ? "Редактирование рассылки" : "Новая рассылка"}
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
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Заголовок (необязательно)
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Скидки на тормозные колодки"
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Текст рассылки <span className="text-accent">*</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Текст, который увидит клиент…"
              className="input resize-none"
            />
          </div>

          {/* Product picker */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Товары в рассылке ({products.length})
            </label>
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
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded bg-gray-100">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/image?u=${encodeURIComponent(
                              p.imageUrl
                            )}`}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-ink">
                          {p.sku}
                        </div>
                        <div className="truncate text-[11px] text-muted">
                          {p.fullName || p.name}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-accent">
                        {formatTenge(p.price)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Получатели
            </label>
            {!ownClientsOnly && (
              <div className="mb-2 flex gap-2">
                <button
                  onClick={() => setIsGlobal(true)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    isGlobal
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-muted hover:border-accent/40"
                  )}
                >
                  <Globe size={14} /> Всем клиентам
                </button>
                <button
                  onClick={() => setIsGlobal(false)}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    !isGlobal
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-line text-muted hover:border-accent/40"
                  )}
                >
                  <Users size={14} /> Выбрать клиентов
                  {!isGlobal && clientIds.size > 0 && ` (${clientIds.size})`}
                </button>
              </div>
            )}

            {!isGlobal && (
              <div className="rounded-lg border border-line">
                <div className="border-b border-line p-2">
                  <input
                    value={cq}
                    onChange={(e) => setCq(e.target.value)}
                    placeholder="Фильтр по имени, логину или городу…"
                    className="input h-9 text-xs"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto p-1">
                  {filteredClients.length === 0 && (
                    <div className="px-2 py-3 text-center text-xs text-muted">
                      Клиенты не найдены
                    </div>
                  )}
                  {filteredClients.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={clientIds.has(c.id)}
                        onChange={() => toggleClient(c.id)}
                        className="h-4 w-4 accent-accent"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink">
                          {c.fullName}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          {c.login}
                          {c.city ? ` · ${c.city}` : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-accent">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="btn-accent"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : editingId ? (
                <CheckCircle2 size={16} />
              ) : (
                <Send size={16} />
              )}
              {editingId ? "Сохранить изменения" : "Отправить рассылку"}
            </button>
            {!editingId && (
              <button onClick={resetForm} className="text-xs text-muted hover:text-ink">
                Очистить
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── List ───────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <Plus size={15} className="text-accent" /> Отправленные рассылки (
          {list.length})
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={16} className="animate-spin" /> Загрузка…
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-muted">
            Пока нет ни одной рассылки.
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-line bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {b.title && (
                        <span className="text-sm font-bold text-ink">
                          {b.title}
                        </span>
                      )}
                      <span
                        className={cx(
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                          b.isGlobal
                            ? "bg-blue-50 text-blue-600"
                            : "bg-violet-50 text-violet-600"
                        )}
                      >
                        {b.isGlobal ? (
                          <>
                            <Globe size={11} /> Всем клиентам
                          </>
                        ) : (
                          <>
                            <Users size={11} /> {b.recipientCount} получ.
                          </>
                        )}
                      </span>
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                        Прочитали: {b.readCount}
                      </span>
                      <span className="text-[11px] text-muted">
                        {new Date(b.createdAt).toLocaleString("ru-RU", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-ink/80">
                      {b.text}
                    </p>
                    {b.products.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {b.products.map((p) => (
                          <span
                            key={p.id}
                            className="rounded border border-line bg-gray-50 px-1.5 py-0.5 text-[11px] text-muted"
                          >
                            {p.sku}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => startEdit(b)}
                      title="Редактировать"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-gray-100 hover:text-ink"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => remove(b.id)}
                      title="Удалить"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-accent"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
