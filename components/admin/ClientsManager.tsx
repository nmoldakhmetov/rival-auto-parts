"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
  UserRound,
  Percent,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { formatTenge, formatDateTime } from "@/lib/format";
import type { Role } from "@/lib/jwt";
import LocalityPicker from "@/components/admin/LocalityPicker";
import { toast } from "@/store/toast";

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
type StaffRoleT = "MANAGER" | "ACCOUNTANT" | "RA";
type StaffRow = {
  id: string;
  login: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  telegramId: string | null;
  role: StaffRoleT;
  isActive: boolean;
  createdAt: string;
};

const STAFF_ROLE_LABEL: Record<StaffRoleT, string> = {
  MANAGER: "Менеджер",
  ACCOUNTANT: "Бухгалтер",
  RA: "Rival Auto (RA)",
};

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
  allowStaff,
}: {
  onClose: () => void;
  onCreated: (user: ClientRow & { role: string }) => void;
  // Only ADMIN/RA may create staff (MANAGER/ACCOUNTANT/RA); others → clients only.
  allowStaff: boolean;
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
                disabled={!allowStaff}
              >
                <option value="CLIENT">Клиент</option>
                {allowStaff && <option value="MANAGER">Менеджер</option>}
                {allowStaff && <option value="ACCOUNTANT">Бухгалтер</option>}
                {allowStaff && <option value="RA">RA (Rival Auto)</option>}
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
            <Field label="Населённый пункт">
              <LocalityPicker
                value={form.city}
                onChange={(v) => set("city", v)}
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

// ─── Staff table (managers / accountants / RA) ──────────────────────────────
function StaffTable({
  rows,
  onToggleActive,
  onSave,
  canEdit,
}: {
  rows: StaffRow[];
  onToggleActive: (s: StaffRow) => void;
  onSave: (id: string, body: Record<string, unknown>) => void;
  canEdit: boolean;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <table className="data-table">
        <thead>
          <tr>
            <th>Сотрудник</th>
            <th>Контакты</th>
            <th className="w-44">Роль</th>
            <th className="w-24 text-center">Статус</th>
            {canEdit && <th className="w-28"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={canEdit ? 5 : 4}
                className="py-12 text-center text-sm text-muted"
              >
                Пока никого.
              </td>
            </tr>
          )}
          {rows.map((s) => (
            <Fragment key={s.id}>
            <tr>
              <td>
                <div className="font-semibold text-ink">{s.fullName}</div>
                <div className="text-[11px] text-muted">
                  {s.login} · ID {s.id.slice(-6)}
                </div>
                <div className="text-[10px] text-gray-400">
                  рег. {formatDateTime(s.createdAt)}
                </div>
              </td>
              <td className="text-[11px] text-muted">
                {s.email && <div>{s.email}</div>}
                {s.phone && <div>{s.phone}</div>}
                {s.role === "MANAGER" && (
                  <div
                    className={
                      s.telegramId ? "text-ink" : "font-medium text-amber-700"
                    }
                    title={
                      s.telegramId
                        ? "Telegram ID для уведомлений о заказах"
                        : "Без Telegram ID бот не сможет прислать заказы этого менеджера"
                    }
                  >
                    TG: {s.telegramId || "не заполнен"}
                  </div>
                )}
                {!s.email && !s.phone && s.role !== "MANAGER" && <span>—</span>}
              </td>
              <td>
                <span className="badge border border-line bg-gray-50 text-ink">
                  {STAFF_ROLE_LABEL[s.role]}
                </span>
              </td>
              <td className="text-center">
                <button
                  onClick={() => onToggleActive(s)}
                  className={cx(
                    "badge border",
                    s.isActive
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-line bg-gray-100 text-muted"
                  )}
                >
                  {s.isActive ? (
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
              {canEdit && (
                <td>
                  <button
                    onClick={() => setEditId(editId === s.id ? null : s.id)}
                    className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
                  >
                    <Pencil size={12} />
                    {editId === s.id ? "Закрыть" : "Изменить"}
                  </button>
                </td>
              )}
            </tr>
            {canEdit && editId === s.id && (
              <tr>
                <td colSpan={5} className="!p-0">
                  <div className="border-y border-line bg-gray-50/70 px-4 py-3">
                    <StaffEditor
                      member={s}
                      onSave={(body) => {
                        onSave(s.id, body);
                        setEditId(null);
                      }}
                      onCancel={() => setEditId(null)}
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
  );
}

// Inline profile editor for a staff record (ADMIN/RA only).
function StaffEditor({
  member,
  onSave,
  onCancel,
}: {
  member: StaffRow;
  onSave: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [fullName, setFullName] = useState(member.fullName);
  const [login, setLogin] = useState(member.login);
  const [email, setEmail] = useState(member.email ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [telegramId, setTelegramId] = useState(member.telegramId ?? "");
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    hint?: string
  ) => (
    <div>
      <label className="mb-1 block text-[11px] text-muted">{label}</label>
      <input
        className="input py-1.5 text-xs"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
      {hint && <p className="mt-0.5 text-[10px] text-muted">{hint}</p>}
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {field("ФИО", fullName, setFullName)}
        {field("Логин", login, setLogin)}
        {field(
          member.role === "MANAGER" ? "WhatsApp (тел.)" : "Телефон",
          phone,
          setPhone
        )}
        {field(
          "Email",
          email,
          setEmail,
          member.role === "MANAGER"
            ? "На этот адрес приходят уведомления о заказах его клиентов"
            : undefined
        )}
        {member.role === "MANAGER" &&
          field(
            "Telegram ID",
            telegramId,
            setTelegramId,
            "Числовой ID (узнать: @userinfobot). Менеджер должен нажать «Start» у бота, иначе Telegram не даст боту написать первым."
          )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSave(
              member.role === "MANAGER"
                ? { fullName, login, email, phone, telegramId }
                : { fullName, login, email, phone }
            )
          }
          className="btn-accent px-3 py-1.5 text-xs"
        >
          <Save size={14} /> Сохранить
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-line px-3 py-1.5 text-xs text-muted hover:text-ink"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────
type Tab = "CLIENT" | StaffRoleT;

export default function ClientsManager({
  initialClients,
  initialManagers,
  initialStaff,
  warehouses,
  viewerRole,
}: {
  initialClients: ClientRow[];
  initialManagers: ManagerOpt[];
  initialStaff: StaffRow[];
  warehouses: WarehouseOpt[];
  viewerRole: Role;
}) {
  const [clients, setClients] = useState(initialClients);
  const [managers, setManagers] = useState(initialManagers);
  const [staff, setStaff] = useState(initialStaff);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<Tab>("CLIENT");
  // ACCOUNTANT has the clients tab but is read-only (no account creation).
  const canCreate = viewerRole !== "ACCOUNTANT";
  // Only ADMIN/RA may create staff (MANAGER/ACCOUNTANT/RA) and see the staff tabs.
  const isOwner = viewerRole === "ADMIN" || viewerRole === "RA";

  // ─── Поиск, фильтры и страницы по клиентам ───────────────────────────────
  // Клиентов сотни (на проде 650+), поэтому список фильтруется и режется на
  // страницы прямо здесь: данные уже загружены, ходить на сервер незачем.
  const [q, setQ] = useState("");
  const [fCountry, setFCountry] = useState("");
  const [fRegion, setFRegion] = useState("");
  const [fCity, setFCity] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 25;

  // «Казахстан, Алматинская область, Алматы» → страна / область / город.
  // Старые записи содержат только город («Алматы») — тогда страна и область
  // пустые, а городом считается последний сегмент.
  const geoOf = (city: string | null) => {
    const p = (city ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return {
      country: p.length >= 2 ? p[0] : "",
      region: p.length >= 3 ? p[1] : "",
      city: p.length ? p[p.length - 1] : "",
    };
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clients.filter((c) => {
      const g = geoOf(c.city);
      if (fCountry && g.country !== fCountry) return false;
      if (fRegion && g.region !== fRegion) return false;
      if (fCity && g.city !== fCity) return false;
      if (!needle) return true;
      return [c.fullName, c.login, c.email, c.phone, c.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [clients, q, fCountry, fRegion, fCity]);

  // Варианты фильтров — из реальных данных, каскадом.
  const geoOptions = useMemo(() => {
    const countries = new Set<string>();
    const regions = new Set<string>();
    const cities = new Set<string>();
    for (const c of clients) {
      const g = geoOf(c.city);
      if (g.country) countries.add(g.country);
      if (g.region && (!fCountry || g.country === fCountry)) regions.add(g.region);
      if (
        g.city &&
        (!fCountry || g.country === fCountry) &&
        (!fRegion || g.region === fRegion)
      ) {
        cities.add(g.city);
      }
    }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "ru"));
    return { countries: sort(countries), regions: sort(regions), cities: sort(cities) };
  }, [clients, fCountry, fRegion]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const filtersActive = !!(q || fCountry || fRegion || fCity);

  // Смена фильтра возвращает на первую страницу, иначе можно «зависнуть»
  // на несуществующей.
  useEffect(() => {
    setPage(1);
  }, [q, fCountry, fRegion, fCity]);

  const staffByRole = (r: StaffRoleT) => staff.filter((s) => s.role === r);
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "CLIENT", label: "Клиенты", count: clients.length },
    { key: "MANAGER", label: "Менеджеры", count: staffByRole("MANAGER").length },
    { key: "ACCOUNTANT", label: "Бухгалтеры", count: staffByRole("ACCOUNTANT").length },
    { key: "RA", label: "RA", count: staffByRole("RA").length },
  ];

  // Optimistic update, rolled back if the server rejects (e.g. a login that is
  // already taken) so the table never shows data that was not saved.
  const patch = async (id: string, body: Record<string, unknown>) => {
    const prev = clients;
    setClients((cs) => cs.map((c) => (c.id === id ? { ...c, ...body } : c)));
    const res = await patchClient(id, body);
    if (!res.ok) {
      setClients(prev);
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Не удалось сохранить изменения");
    } else {
      toast.success("Сохранено");
    }
  };

  // Same, for staff records (managers / accountants / RA).
  const patchStaff = async (id: string, body: Record<string, unknown>) => {
    const prev = staff;
    setStaff((ss) => ss.map((s) => (s.id === id ? { ...s, ...body } : s)));
    const res = await patchClient(id, body);
    if (!res.ok) {
      setStaff(prev);
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Не удалось сохранить изменения");
    } else {
      toast.success("Сохранено");
    }
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

  async function toggleStaffActive(member: StaffRow) {
    const next = !member.isActive;
    setStaff((ss) =>
      ss.map((s) => (s.id === member.id ? { ...s, isActive: next } : s))
    );
    await patchClient(member.id, { isActive: next });
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
    if (user.role === "CLIENT") {
      setClients((cs) => [{ ...user, access: [] }, ...cs]);
      setTab("CLIENT");
    } else {
      const role = user.role as StaffRoleT;
      setStaff((ss) => [
        {
          id: user.id,
          login: user.login,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          // Заполняется отдельно через «Изменить» — при создании его не спрашиваем.
          telegramId: null,
          role,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
        ...ss,
      ]);
      // Keep the manager-assignment dropdown in sync.
      if (role === "MANAGER") {
        setManagers((m) =>
          [...m, { id: user.id, fullName: user.fullName }].sort((a, b) =>
            a.fullName.localeCompare(b.fullName)
          )
        );
      }
      setTab(role);
    }
    setShowCreate(false);
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {isOwner ? "Пользователи" : "Клиенты"}
          </h1>
          <p className="text-xs text-muted">
            {clients.length} клиент(ов)
            {isOwner &&
              ` · ${staffByRole("MANAGER").length} менеджер(ов) · ${
                staffByRole("ACCOUNTANT").length
              } бухг. · ${staffByRole("RA").length} RA`}
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="btn-accent">
            <UserPlus size={16} /> Новый пользователь
          </button>
        )}
      </div>

      {isOwner && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setExpanded(null);
              }}
              className={cx(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.key
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-white text-muted hover:bg-gray-50"
              )}
            >
              {t.label}{" "}
              <span className={tab === t.key ? "text-white/80" : "text-gray-400"}>
                ({t.count})
              </span>
            </button>
          ))}
        </div>
      )}

      {tab !== "CLIENT" ? (
        <StaffTable
          rows={staffByRole(tab)}
          onToggleActive={toggleStaffActive}
          onSave={patchStaff}
          canEdit={isOwner}
        />
      ) : (
      <>
      {/* Поиск + фильтры по географии */}
      <div className="mb-3 space-y-2">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск: ФИО, логин, телефон, почта, город…"
            className="input pl-9"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            value={fCountry}
            onChange={(e) => {
              setFCountry(e.target.value);
              setFRegion("");
              setFCity("");
            }}
            className="input py-1.5 text-xs"
          >
            <option value="">Все страны</option>
            {geoOptions.countries.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={fRegion}
            onChange={(e) => {
              setFRegion(e.target.value);
              setFCity("");
            }}
            className="input py-1.5 text-xs"
          >
            <option value="">Все области</option>
            {geoOptions.regions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={fCity}
            onChange={(e) => setFCity(e.target.value)}
            className="input py-1.5 text-xs"
          >
            <option value="">Все города</option>
            {geoOptions.cities.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {filtersActive && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">
              Найдено: <b className="text-ink">{filtered.length}</b> из{" "}
              {clients.length}
            </span>
            <button
              onClick={() => {
                setQ("");
                setFCountry("");
                setFRegion("");
                setFCity("");
              }}
              className="flex items-center gap-1 text-muted transition-colors hover:text-accent"
            >
              <X size={12} /> Сбросить
            </button>
          </div>
        )}
      </div>

      {/* overflow-x-auto, а не overflow-hidden: на телефоне таблицу нужно
          прокручивать вбок, иначе правые колонки недостижимы. */}
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="data-table min-w-[900px]">
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-sm text-muted">
                  {clients.length === 0
                    ? "Клиентов пока нет."
                    : "Под фильтры никто не подошёл."}
                </td>
              </tr>
            )}
            {pageRows.map((c) => (
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
                    {viewerRole === "MANAGER" ? (
                      // A manager cannot hand their own client over (or unassign
                      // them) — that would drop the client out of their list for
                      // good. Reassignment is an ADMIN/RA action.
                      <span
                        title="Клиент закреплён за вами. Передать его другому менеджеру может только администратор."
                        className="flex items-center gap-1.5 text-xs font-medium text-ink"
                      >
                        <UserRound size={13} className="shrink-0 text-muted" />
                        {managers.find((m) => m.id === c.managerId)?.fullName ??
                          "— не назначен —"}
                      </span>
                    ) : (
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
                    )}
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

      {filtered.length > PER_PAGE && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted">
            Показано{" "}
            <b className="text-ink">
              {(safePage - 1) * PER_PAGE + 1}–
              {(safePage - 1) * PER_PAGE + pageRows.length}
            </b>{" "}
            из <b className="text-ink">{filtered.length}</b>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="flex h-7 w-7 items-center justify-center rounded border border-line disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="px-1 text-muted">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="flex h-7 w-7 items-center justify-center rounded border border-line disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {showCreate && canCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={onCreated}
          allowStaff={isOwner}
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
    fullName: string;
    login: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    comment: string;
  }) => void;
}) {
  const [fullName, setFullName] = useState(client.fullName);
  const [login, setLogin] = useState(client.login);
  const [email, setEmail] = useState(client.email ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const [city, setCity] = useState(client.city ?? "");
  const [comment, setComment] = useState(client.comment ?? "");
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Wallet size={14} /> Детали клиента
      </div>
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] text-muted">
              ФИО / Организация
            </label>
            <input
              className="input py-1.5 text-xs"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted">Логин</label>
            <input
              className="input py-1.5 text-xs"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted">Телефон</label>
            <input
              className="input py-1.5 text-xs"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted">Email</label>
            <input
              className="input py-1.5 text-xs"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
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
            Адрес (улица, дом — уходит в 1С при доставке)
          </label>
          <input
            className="input py-1.5 text-xs"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
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
        {/* Скидки живут в одном месте — в разделе «Скидки». Раньше здесь было
            ещё поле «Личная скидка», и менеджеры не понимали, каким из двух
            путей её назначать. */}
        <Link
          href="/admin/discounts"
          className="flex items-center gap-1.5 rounded-lg border border-line bg-gray-50 px-3 py-2 text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-ink"
        >
          <Percent size={13} className="shrink-0 text-accent" />
          <span>
            Скидки и наценки для этого клиента настраиваются в разделе{" "}
            <b className="text-ink">«Скидки»</b>
          </span>
        </Link>
        <button
          onClick={() =>
            onSave({ fullName, login, email, phone, address, city, comment })
          }
          className="btn-accent px-3 py-1.5 text-xs"
        >
          <Save size={14} /> Сохранить детали
        </button>
      </div>
    </div>
  );
}
