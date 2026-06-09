"use client";

import { Fragment, useState } from "react";
import {
  UserPlus,
  ChevronDown,
  Check,
  X,
  Save,
  ShieldCheck,
  ShieldOff,
  Loader2,
  Warehouse as WarehouseIcon,
  Pencil,
  Wallet,
} from "lucide-react";
import { formatTenge, formatDateTime } from "@/lib/format";

type ClientRow = {
  id: string;
  login: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  balance: number;
  discountPercent: number;
  comment: string | null;
  createdAt: string;
  isActive: boolean;
  managerId: string | null;
  access: string[];
};
type ManagerOpt = { id: string; fullName: string };
type WarehouseOpt = { id: string; name: string };

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

async function patchClient(id: string, body: Record<string, unknown>) {
  return fetch(`/api/admin/clients/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── Inline balance editor ────────────────────────────────────────────────
function BalanceCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="input w-24 py-1 text-xs"
          autoFocus
        />
        <button
          onClick={() => {
            const n = Number(val);
            if (Number.isFinite(n)) onSave(n);
            setEditing(false);
          }}
          className="flex h-6 w-6 items-center justify-center rounded bg-accent text-white"
        >
          <Save size={12} />
        </button>
        <button
          onClick={() => {
            setVal(String(value));
            setEditing(false);
          }}
          className="flex h-6 w-6 items-center justify-center rounded border border-line text-muted"
        >
          <X size={12} />
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="group/bal inline-flex items-center gap-1.5"
      title="Изменить баланс"
    >
      <span
        className={cx(
          "font-semibold",
          value > 0 ? "text-accent" : value < 0 ? "text-green-700" : "text-ink"
        )}
      >
        {formatTenge(value)}
      </span>
      {value > 0 && <span className="text-[10px] text-accent">долг</span>}
      <Pencil
        size={11}
        className="text-gray-300 opacity-0 transition-opacity group-hover/bal:opacity-100"
      />
    </button>
  );
}

// ─── Inline warehouse-access editor ───────────────────────────────────────
function AccessEditor({
  warehouses,
  initial,
  onSave,
}: {
  warehouses: WarehouseOpt[];
  initial: string[];
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-ink">
          Склады, видимые клиенту
        </span>
        <div className="flex gap-3 text-[11px]">
          <button
            onClick={() => setSelected(new Set(warehouses.map((w) => w.id)))}
            className="text-accent hover:underline"
          >
            Выбрать все
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-muted hover:underline"
          >
            Снять все
          </button>
        </div>
      </div>
      {warehouses.length === 0 ? (
        <p className="text-xs text-muted">Складов пока нет — синхронизируйте 1С.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {warehouses.map((w) => {
            const on = selected.has(w.id);
            return (
              <button
                key={w.id}
                onClick={() => toggle(w.id)}
                className={cx(
                  "flex items-center gap-2 rounded border px-2.5 py-1.5 text-left text-xs transition-colors",
                  on
                    ? "border-accent bg-accent/5 text-ink"
                    : "border-line bg-white text-muted hover:bg-gray-50"
                )}
              >
                <span
                  className={cx(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                    on ? "border-accent bg-accent text-white" : "border-gray-300"
                  )}
                >
                  {on && <Check size={11} />}
                </span>
                <WarehouseIcon size={13} className="shrink-0 opacity-60" />
                <span className="truncate">{w.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <button
        onClick={() => onSave([...selected])}
        className="btn-accent mt-3 px-3 py-1.5 text-xs"
      >
        <Save size={14} /> Сохранить доступы
      </button>
    </div>
  );
}

// ─── Create-user modal ────────────────────────────────────────────────────
function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (user: ClientRow & { role: string }) => void;
}) {
  const [form, setForm] = useState({
    role: "CLIENT",
    login: "",
    password: "",
    fullName: "",
    email: "",
    phone: "",
    city: "",
    address: "",
    comment: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      onCreated(data.user);
    } catch {
      setError("Сервер недоступен");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Новый пользователь</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Роль">
              <select
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                className="input"
              >
                <option value="CLIENT">Клиент</option>
                <option value="MANAGER">Менеджер</option>
              </select>
            </Field>
            <Field label="Логин *">
              <input
                className="input"
                value={form.login}
                onChange={(e) => set("login", e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Пароль *">
              <input
                className="input"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
            <Field
              label={form.role === "MANAGER" ? "WhatsApp (тел.)" : "Телефон"}
            >
              <input
                className="input"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+7 …"
              />
            </Field>
          </div>
          <Field label="ФИО / Организация *">
            <input
              className="input"
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Email">
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Город">
              <input
                className="input"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
          </div>
          {form.role === "CLIENT" && (
            <>
              <Field label="Адрес">
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
              <Field label="Комментарий">
                <textarea
                  className="input resize-none"
                  rows={2}
                  value={form.comment}
                  onChange={(e) => set("comment", e.target.value)}
                />
              </Field>
            </>
          )}
          {error && (
            <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent-dark">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">
              Отмена
            </button>
            <button type="submit" disabled={loading} className="btn-accent">
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <UserPlus size={16} />
              )}
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
export default function ClientsManager({
  initialClients,
  initialManagers,
  warehouses,
}: {
  initialClients: ClientRow[];
  initialManagers: ManagerOpt[];
  warehouses: WarehouseOpt[];
}) {
  const [clients, setClients] = useState(initialClients);
  const [managers, setManagers] = useState(initialManagers);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const patch = (id: string, body: Record<string, unknown>) => {
    patchClient(id, body);
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...body } : c)));
  };

  async function assignManager(clientId: string, managerId: string) {
    const prev = clients;
    setClients((cs) =>
      cs.map((c) =>
        c.id === clientId ? { ...c, managerId: managerId || null } : c
      )
    );
    const res = await patchClient(clientId, { managerId: managerId || null });
    if (!res.ok) setClients(prev);
  }

  async function toggleActive(client: ClientRow) {
    const next = !client.isActive;
    patch(client.id, { isActive: next });
  }

  async function saveAccess(clientId: string, ids: string[]) {
    setClients((cs) =>
      cs.map((c) => (c.id === clientId ? { ...c, access: ids } : c))
    );
    await fetch(`/api/admin/clients/${clientId}/access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ warehouseIds: ids }),
    });
  }

  function onCreated(user: ClientRow & { role: string }) {
    if (user.role === "MANAGER") {
      setManagers((m) =>
        [...m, { id: user.id, fullName: user.fullName }].sort((a, b) =>
          a.fullName.localeCompare(b.fullName)
        )
      );
    } else {
      setClients((cs) => [{ ...user, access: [] }, ...cs]);
    }
    setShowCreate(false);
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">Клиенты</h1>
          <p className="text-xs text-muted">
            {clients.length} клиент(ов) · {managers.length} менеджер(ов)
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-accent">
          <UserPlus size={16} /> Новый пользователь
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="data-table">
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Контакты</th>
              <th className="w-48">Менеджер</th>
              <th className="w-36">Баланс</th>
              <th className="w-52">Склады / детали</th>
              <th className="w-24 text-center">Статус</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-muted">
                  Клиентов пока нет.
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td>
                    <div className="font-semibold text-ink">{c.fullName}</div>
                    <div className="text-[11px] text-muted">
                      {c.login} · ID {c.id.slice(-6)}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      рег. {formatDateTime(c.createdAt)}
                    </div>
                  </td>
                  <td className="text-[11px] text-muted">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div>{c.phone}</div>}
                    {c.city && <div className="text-ink">{c.city}</div>}
                    {!c.email && !c.phone && !c.city && <span>—</span>}
                  </td>
                  <td>
                    <select
                      value={c.managerId ?? ""}
                      onChange={(e) => assignManager(c.id, e.target.value)}
                      className="input py-1.5 text-xs"
                    >
                      <option value="">— не назначен —</option>
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <BalanceCell
                      value={c.balance}
                      onSave={(v) => patch(c.id, { balance: v })}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() =>
                        setExpanded((id) => (id === c.id ? null : c.id))
                      }
                      className="flex items-center gap-1.5 rounded border border-line px-2.5 py-1.5 text-xs hover:bg-gray-50"
                    >
                      <WarehouseIcon size={13} className="text-accent" />
                      <span className="font-medium text-ink">
                        {c.access.length}
                      </span>
                      <span className="text-muted">/ {warehouses.length}</span>
                      <ChevronDown
                        size={13}
                        className={cx(
                          "text-muted transition-transform",
                          expanded === c.id && "rotate-180"
                        )}
                      />
                    </button>
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => toggleActive(c)}
                      className={cx(
                        "badge border",
                        c.isActive
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-line bg-gray-100 text-muted"
                      )}
                    >
                      {c.isActive ? (
                        <>
                          <ShieldCheck size={12} className="mr-1" /> Активен
                        </>
                      ) : (
                        <>
                          <ShieldOff size={12} className="mr-1" /> Блок
                        </>
                      )}
                    </button>
                  </td>
                </tr>
                {expanded === c.id && (
                  <tr>
                    <td colSpan={6} className="bg-gray-50 p-4">
                      <div className="grid gap-6 lg:grid-cols-2">
                        <AccessEditor
                          warehouses={warehouses}
                          initial={c.access}
                          onSave={(ids) => saveAccess(c.id, ids)}
                        />
                        <ClientDetails
                          client={c}
                          onSave={(body) => patch(c.id, body)}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

function ClientDetails({
  client,
  onSave,
}: {
  client: ClientRow;
  onSave: (body: {
    city: string;
    comment: string;
    discountPercent: number;
  }) => void;
}) {
  const [city, setCity] = useState(client.city ?? "");
  const [comment, setComment] = useState(client.comment ?? "");
  const [discount, setDiscount] = useState(String(client.discountPercent));
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Wallet size={14} /> Детали клиента
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-muted">Город</label>
            <input
              className="input py-1.5 text-xs"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted">
              Личная скидка, %
            </label>
            <input
              type="number"
              className="input py-1.5 text-xs"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted">
            Комментарий
          </label>
          <textarea
            className="input resize-none py-1.5 text-xs"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
        <button
          onClick={() =>
            onSave({
              city,
              comment,
              discountPercent: Math.max(
                0,
                Math.min(95, parseInt(discount) || 0)
              ),
            })
          }
          className="btn-accent px-3 py-1.5 text-xs"
        >
          <Save size={14} /> Сохранить детали
        </button>
      </div>
    </div>
  );
}
