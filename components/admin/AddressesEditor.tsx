"use client";

import { useEffect, useState } from "react";
import { MapPin, Plus, Save, Trash2, Star, X, Loader2 } from "lucide-react";
import LocalityPicker from "@/components/admin/LocalityPicker";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Address = {
  id: string;
  label: string | null;
  city: string | null;
  address: string;
  isDefault: boolean;
};

// Адреса доставки клиента. У оптовика их обычно несколько (склад, офис,
// точка выдачи); клиент выбирает нужный при оформлении, и именно он уходит
// в 1С. Список ведёт персонал — так в 1С не попадают адреса, набранные на
// бегу с ошибками.
export default function AddressesEditor({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Форма добавления (открывается по кнопке).
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  async function load() {
    setLoading(true);
    try {
      const d = await fetch(`/api/admin/clients/${clientId}/addresses`).then((r) =>
        r.json()
      );
      setRows(d.addresses ?? []);
    } catch {
      setError("Не удалось загрузить адреса");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function add() {
    setError(null);
    if (!address.trim()) {
      setError("Укажите адрес (улица, дом)");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, city, address }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error ?? "Не удалось добавить адрес");
        return;
      }
      setLabel("");
      setCity("");
      setAddress("");
      setAdding(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/clients/${clientId}/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/clients/${clientId}/addresses/${id}`, {
      method: "DELETE",
    });
    await load();
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <MapPin size={14} /> Адреса доставки
          {rows.length > 0 && (
            <span className="font-normal text-muted">({rows.length})</span>
          )}
        </div>
        {canEdit && !adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
          >
            <Plus size={12} /> Добавить адрес
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <Loader2 size={13} className="animate-spin" /> Загружаем…
        </div>
      ) : rows.length === 0 && !adding ? (
        <div className="rounded-lg border border-line bg-white px-3 py-4 text-center text-[11px] text-muted">
          Адресов пока нет. Клиент не сможет выбрать адрес при оформлении.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((a) => (
            <li
              key={a.id}
              className={cx(
                "flex items-start gap-2 rounded-lg border bg-white px-3 py-2",
                a.isDefault ? "border-accent/40" : "border-line"
              )}
            >
              <div className="min-w-0 flex-1 text-[11px] leading-snug">
                {a.label && (
                  <span className="mr-1 font-semibold text-ink">{a.label}:</span>
                )}
                <span className="text-ink">
                  {[a.city, a.address].filter(Boolean).join(", ")}
                </span>
                {a.isDefault && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-accent">
                    <Star size={9} /> основной
                  </span>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  {!a.isDefault && (
                    <button
                      onClick={() => patch(a.id, { isDefault: true })}
                      title="Сделать основным"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-gray-100 hover:text-accent"
                    >
                      <Star size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => remove(a.id)}
                    title="Удалить адрес"
                    className="flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-accent/10 hover:text-accent"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && adding && (
        <div className="mt-2 space-y-2 rounded-lg border border-line bg-gray-50 p-3">
          <div>
            <label className="mb-1 block text-[11px] text-muted">
              Название (необязательно): «Склад», «Офис»
            </label>
            <input
              className="input py-1.5 text-xs"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted">
              Населённый пункт
            </label>
            <LocalityPicker
              value={city}
              onChange={setCity}
              className="py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted">
              Адрес (улица, дом — уходит в 1С)
            </label>
            <input
              className="input py-1.5 text-xs"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Жибек Жолы 15, ряд 50"
            />
          </div>
          {error && <div className="text-[11px] text-accent">{error}</div>}
          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={saving}
              className="btn-accent px-3 py-1.5 text-xs"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              Добавить
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              className="rounded border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
            >
              <X size={13} /> Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
