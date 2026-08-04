"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Save,
  X,
  Gift,
  PackageSearch,
  ImageOff,
  ExternalLink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { formatTenge, formatDateTime } from "@/lib/format";
import DiscountPill, {
  type DiscountSummaryLite,
} from "@/components/admin/DiscountPill";
import { toast } from "@/store/toast";

type OrderStatus =
  | "NEW"
  | "SENT"
  | "PROCESSING"
  | "OUT_OF_STOCK"
  | "ISSUED"
  | "COMPLETED"
  | "CANCELLED";

type Row = {
  id: string;
  orderNo: string;
  createdAt: string;
  status: OrderStatus;
  total: number;
  paid: number;
  debt: number;
  itemsCount: number;
  client: { fullName: string; email: string | null; login: string } | null;
  // Текущая скидка/наценка клиента (lib/discount-summary).
  discountSummary: DiscountSummaryLite | null;
};

type OrderItem = {
  id: string;
  sku: string;
  name: string;
  price: number;
  qty: number;
  // Сколько было заказано до правки менеджером (null — не трогали).
  qtyOriginal: number | null;
  isGift: boolean;
  // Склад, с которого заказана строка (null у старых заказов и когда
  // остатка нигде не было).
  warehouse: string | null;
  // Товар с «окончательной ценой» из 1С — скидка клиента на него не идёт.
  isFinalPrice: boolean;
  // Live catalog links — null when the product no longer exists in 1С.
  productId: string | null;
  imageUrl: string | null;
};
type OrderDetails = {
  comment: string | null;
  onecSent: boolean;
  onecNumber: string | null;
  // Правка состава: когда правили и что написали клиенту.
  editedAt: string | null;
  editNote: string | null;
  client: {
    fullName: string;
    login: string;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  items: OrderItem[];
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Долговые статусы — тот же список, что на сервере (lib/balance.ts). Нужен
// здесь, чтобы после правки состава сразу показать верный долг в строке.
const DEBT_STATUSES: OrderStatus[] = ["PROCESSING", "ISSUED", "COMPLETED"];
const countsAsDebtStatus = (s: OrderStatus) => DEBT_STATUSES.includes(s);

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "NEW", label: "Заказ принят" },
  { value: "PROCESSING", label: "В работе" },
  { value: "OUT_OF_STOCK", label: "Нет в наличии" },
  { value: "ISSUED", label: "Выдано" },
  { value: "CANCELLED", label: "Отказ клиента" },
  { value: "SENT", label: "Отправлен" },
  { value: "COMPLETED", label: "Выполнен" },
];
const STATUS_CLS: Record<OrderStatus, string> = {
  NEW: "bg-blue-50 text-blue-700 border-blue-200",
  SENT: "bg-amber-50 text-amber-700 border-amber-200",
  PROCESSING: "bg-purple-50 text-purple-700 border-purple-200",
  OUT_OF_STOCK: "bg-orange-50 text-orange-700 border-orange-200",
  ISSUED: "bg-green-50 text-green-700 border-green-200",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  CANCELLED: "bg-gray-100 text-muted border-line",
};

export default function OrdersAdmin() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sums, setSums] = useState({ total: 0, paid: 0, debt: 0 });
  const [loading, setLoading] = useState(true);
  const [payEdit, setPayEdit] = useState<{ id: string; val: string } | null>(
    null
  );
  // Expanded order → its contents. Fetched on first open and kept, so
  // collapsing and reopening a row is instant.
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, OrderDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);
  // Правка состава заказа: черновик количеств по строкам + сообщение клиенту.
  // Живёт только пока раскрыт заказ — «Сохранить» отправляет всё разом.
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({});
  const [editNote, setEditNote] = useState("");
  const [savingItems, setSavingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // Hovered order line → floating photo preview. Rendered position:fixed so
  // the surrounding overflow-hidden table wrappers cannot clip it.
  const [preview, setPreview] = useState<{
    top: number;
    left: number;
    item: OrderItem;
  } | null>(null);

  const PREVIEW_W = 240;
  const PREVIEW_H = 280;

  function showPreview(e: React.MouseEvent, item: OrderItem) {
    if (!item.imageUrl) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Prefer the right side of the row; flip left when it would overflow.
    let left = rect.right + 12;
    if (left + PREVIEW_W > window.innerWidth - 8) {
      left = Math.max(8, rect.left - PREVIEW_W - 12);
    }
    const top = Math.min(
      Math.max(8, rect.top - 40),
      Math.max(8, window.innerHeight - PREVIEW_H - 8)
    );
    setPreview({ top, left, item });
  }

  // No product detail page exists — the catalog deep-link with an exact SKU
  // puts the item first and highlights it (see the exactMatch handling).
  function openInCatalog(item: OrderItem) {
    router.push(`/catalog?q=${encodeURIComponent(item.sku)}`);
  }

  function toggleDetails(id: string) {
    // Черновик правки принадлежит конкретному заказу — при закрытии или
    // переключении на другой он сбрасывается, чтобы количества не «переехали».
    setQtyDraft({});
    setEditNote("");
    setItemsError(null);
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    if (details[id]) return;
    setDetailsLoading(id);
    fetch(`/api/admin/orders/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.order) setDetails((m) => ({ ...m, [id]: d.order }));
      })
      .catch(() => {})
      .finally(() => setDetailsLoading(null));
  }

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    params.set("page", String(page));
    fetch(`/api/admin/orders?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? 1);
        setSums(d.sums ?? { total: 0, paid: 0, debt: 0 });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, q, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function changeStatus(id: string, newStatus: OrderStatus) {
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, status: newStatus } : r))
    );
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  // Сохранить правку количеств. Строки без изменений не шлём — сервер их
  // всё равно отбросит, а так виден честный счётчик изменённых позиций.
  async function saveItems(orderId: string) {
    const d = details[orderId];
    if (!d) return;
    const changed = d.items
      .filter((it) => {
        const raw = qtyDraft[it.id];
        if (raw === undefined || raw === "") return false;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 && n !== it.qty;
      })
      .map((it) => ({ id: it.id, qty: Math.trunc(Number(qtyDraft[it.id])) }));

    if (changed.length === 0) {
      setItemsError("Количество не изменилось");
      return;
    }
    setSavingItems(true);
    setItemsError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: changed, note: editNote.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setItemsError(data.error ?? "Не удалось сохранить");
        return;
      }
      // Перечитываем состав (там уже проставлено qtyOriginal) и обновляем
      // сумму с долгом в строке списка.
      const fresh = await fetch(`/api/admin/orders/${orderId}`)
        .then((r) => r.json())
        .catch(() => null);
      if (fresh?.order) {
        setDetails((m) => ({ ...m, [orderId]: fresh.order }));
      }
      setRows((rs) =>
        rs.map((r) =>
          r.id === orderId
            ? {
                ...r,
                total: data.total ?? r.total,
                debt: countsAsDebtStatus(r.status)
                  ? (data.total ?? r.total) - r.paid
                  : 0,
              }
            : r
        )
      );
      setQtyDraft({});
      setEditNote("");
      toast.success(`Состав заказа изменён: позиций — ${data.changed}`);
    } catch {
      setItemsError("Сервер недоступен. Повторите попытку.");
    } finally {
      setSavingItems(false);
    }
  }

  async function savePaid(id: string, paid: number) {
    setRows((rs) =>
      rs.map((r) =>
        r.id === id ? { ...r, paid, debt: r.total - paid } : r
      )
    );
    setPayEdit(null);
    await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid }),
    });
  }

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Заказы</h1>
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted">
        <span>
          Всего заказов: <b className="text-ink">{total}</b>
        </span>
        <span>
          Сумма: <b className="text-ink">{formatTenge(sums.total)}</b>
        </span>
        <span>
          Оплачено: <b className="text-green-700">{formatTenge(sums.paid)}</b>
        </span>
        <span>
          Долг: <b className="text-accent">{formatTenge(sums.debt)}</b>
        </span>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="input w-48"
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
            placeholder="Клиент, логин или email…"
            className="input w-72 pl-9"
          />
        </div>
        {loading && <Loader2 size={16} className="animate-spin text-muted" />}
      </div>

      {/* Table. overflow-x-auto, а не overflow-hidden: на телефоне таблицу
          нужно прокручивать вбок, иначе правые колонки просто отрезаны. */}
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="data-table min-w-[1000px]">
          <thead>
            <tr>
              <th className="w-8"></th>
              <th className="w-24">№</th>
              <th className="w-36">Дата</th>
              <th>Клиент</th>
              <th className="w-16 text-center">Поз.</th>
              <th className="w-28 text-right">Сумма</th>
              <th className="w-32 text-right">Оплачено</th>
              <th className="w-28 text-right">Долг</th>
              <th className="w-44">Статус</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-muted">
                  Заказов не найдено.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Fragment key={r.id}>
              <tr
                onClick={() => toggleDetails(r.id)}
                title="Показать состав заказа"
                className="cursor-pointer"
              >
                <td>
                  <span
                    className={cx(
                      "flex h-6 w-6 items-center justify-center rounded text-muted transition-all duration-200",
                      openId === r.id && "rotate-180 bg-accent/10 text-accent"
                    )}
                  >
                    <ChevronDown size={15} />
                  </span>
                </td>
                <td className="font-bold text-ink">№{r.orderNo}</td>
                <td className="text-[11px] text-muted">
                  {formatDateTime(r.createdAt)}
                </td>
                <td>
                  {r.client ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-ink">
                          {r.client.fullName}
                        </span>
                        <DiscountPill summary={r.discountSummary} />
                      </div>
                      <div className="text-[11px] text-muted">
                        {r.client.login}
                        {r.client.email ? ` · ${r.client.email}` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="text-center text-muted">{r.itemsCount}</td>
                <td className="text-right font-semibold text-ink">
                  {formatTenge(r.total)}
                </td>
                {/* Interactive cells swallow the click so editing money or
                    status doesn't fold the row open/closed. */}
                <td className="text-right" onClick={(e) => e.stopPropagation()}>
                  {payEdit?.id === r.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        value={payEdit.val}
                        onChange={(e) =>
                          setPayEdit({
                            id: r.id,
                            // Ведущие нули не копим: набранное поверх «0»
                            // превращалось в «012876».
                            val: e.target.value.replace(/^0+(?=\d)/, ""),
                          })
                        }
                        onFocus={(e) => e.currentTarget.select()}
                        placeholder="0"
                        className="input w-24 py-1 text-xs"
                        autoFocus
                      />
                      <button
                        onClick={() =>
                          savePaid(r.id, Math.max(0, Number(payEdit.val) || 0))
                        }
                        className="flex h-6 w-6 items-center justify-center rounded bg-accent text-white"
                      >
                        <Save size={12} />
                      </button>
                      <button
                        onClick={() => setPayEdit(null)}
                        className="flex h-6 w-6 items-center justify-center rounded border border-line text-muted"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        // Неоплаченный заказ открывается ПУСТЫМ полем, а не
                        // нулём: иначе введённая сумма дописывалась к нему.
                        setPayEdit({ id: r.id, val: r.paid ? String(r.paid) : "" })
                      }
                      className="group/p inline-flex items-center gap-1 text-green-700"
                      title="Изменить оплату"
                    >
                      {formatTenge(r.paid)}
                      <Pencil
                        size={11}
                        className="text-gray-300 opacity-0 group-hover/p:opacity-100"
                      />
                    </button>
                  )}
                </td>
                <td
                  className={cx(
                    "text-right font-semibold",
                    r.debt > 0 ? "text-accent" : "text-muted"
                  )}
                >
                  {formatTenge(r.debt)}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <select
                    value={r.status}
                    onChange={(e) =>
                      changeStatus(r.id, e.target.value as OrderStatus)
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

              {/* ── Expanded: what the client actually bought ────────── */}
              {openId === r.id && (
                <tr>
                  <td colSpan={9} className="!p-0">
                    <div className="animate-fade-in-up border-y border-line bg-gray-50/70 px-6 py-4">
                      {detailsLoading === r.id && !details[r.id] ? (
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <Loader2 size={14} className="animate-spin" />
                          Загружаем состав заказа…
                        </div>
                      ) : !details[r.id] ? (
                        <div className="text-xs text-muted">
                          Не удалось загрузить состав заказа.
                        </div>
                      ) : (
                        <>
                          <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted">
                            <span className="flex items-center gap-1.5 font-semibold text-ink">
                              <PackageSearch size={14} className="text-accent" />
                              Состав заказа №{r.orderNo}
                            </span>
                            {details[r.id].client?.phone && (
                              <span>тел.: {details[r.id].client?.phone}</span>
                            )}
                            {details[r.id].client?.address && (
                              <span>адрес: {details[r.id].client?.address}</span>
                            )}
                            <span>
                              в 1С:{" "}
                              {details[r.id].onecSent ? (
                                <b className="text-green-700">
                                  отправлен
                                  {details[r.id].onecNumber
                                    ? ` (№${details[r.id].onecNumber})`
                                    : ""}
                                </b>
                              ) : (
                                <b className="text-amber-700">не отправлен</b>
                              )}
                            </span>
                          </div>

                          <div className="overflow-hidden rounded-lg border border-line bg-white">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th className="w-14">Фото</th>
                                  <th className="w-40">Артикул</th>
                                  <th>Наименование</th>
                                  <th className="w-36">Склад</th>
                                  <th className="w-28 text-right">Цена</th>
                                  <th className="w-20 text-center">Кол-во</th>
                                  <th className="w-28 text-right">Сумма</th>
                                </tr>
                              </thead>
                              <tbody>
                                {details[r.id].items.map((it) => (
                                  <tr
                                    key={it.id}
                                    onMouseEnter={(e) => showPreview(e, it)}
                                    onMouseLeave={() => setPreview(null)}
                                    onClick={() => openInCatalog(it)}
                                    title={`Открыть ${it.sku} в каталоге`}
                                    className={cx(
                                      "group/it cursor-pointer",
                                      it.isGift && "bg-green-50/50"
                                    )}
                                  >
                                    <td>
                                      {it.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={`/api/image?u=${encodeURIComponent(it.imageUrl)}`}
                                          alt={it.sku}
                                          loading="lazy"
                                          className="h-10 w-10 rounded border border-line bg-white object-contain"
                                        />
                                      ) : (
                                        <div className="flex h-10 w-10 items-center justify-center rounded border border-line bg-gray-50 text-gray-300">
                                          <ImageOff size={14} />
                                        </div>
                                      )}
                                    </td>
                                    <td className="font-semibold text-ink">
                                      <span className="inline-flex items-center gap-1.5 group-hover/it:text-accent">
                                        {it.sku}
                                        <ExternalLink
                                          size={12}
                                          className="opacity-0 transition-opacity group-hover/it:opacity-100"
                                        />
                                      </span>
                                    </td>
                                    <td>
                                      <span className="text-ink">{it.name}</span>
                                      {it.isGift && (
                                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                          <Gift size={10} /> подарок
                                        </span>
                                      )}
                                      {/* Почему на позиции нет скидки: 1С
                                          пометила товар окончательной ценой. */}
                                      {!it.isGift && it.isFinalPrice && (
                                        <span
                                          title="1С пометила товар «окончательная цена» — скидка клиента на него не действует (наценка действует)"
                                          className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700"
                                        >
                                          без скидки
                                        </span>
                                      )}
                                    </td>
                                    {/* Склад строки: по нему заказ разбивался
                                        на документы 1С. */}
                                    <td className="text-[11px]">
                                      {it.warehouse ? (
                                        <span className="text-ink">
                                          {it.warehouse}
                                        </span>
                                      ) : (
                                        <span className="text-muted">
                                          под заказ
                                        </span>
                                      )}
                                    </td>
                                    <td className="text-right">
                                      {it.isGift ? (
                                        <span className="font-semibold text-green-700">
                                          Бесплатно
                                        </span>
                                      ) : (
                                        formatTenge(it.price)
                                      )}
                                    </td>
                                    {/* Количество правится прямо здесь: в 1С
                                        остаток бывает неактуальным, и часть
                                        позиции отгрузить нечем. 0 = не
                                        отгружаем вовсе. */}
                                    <td
                                      className="text-center"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        {it.qtyOriginal != null &&
                                          it.qtyOriginal !== it.qty && (
                                            <span
                                              className="text-[11px] text-gray-400 line-through"
                                              title="Заказано клиентом"
                                            >
                                              {it.qtyOriginal}
                                            </span>
                                          )}
                                        <input
                                          type="number"
                                          min={0}
                                          value={qtyDraft[it.id] ?? String(it.qty)}
                                          onChange={(e) =>
                                            setQtyDraft((m) => ({
                                              ...m,
                                              [it.id]: e.target.value.replace(
                                                /^0+(?=\d)/,
                                                ""
                                              ),
                                            }))
                                          }
                                          onFocus={(e) => e.currentTarget.select()}
                                          className={cx(
                                            "input w-16 px-1 py-1 text-center text-xs",
                                            qtyDraft[it.id] !== undefined &&
                                              Number(qtyDraft[it.id]) !== it.qty &&
                                              "border-accent bg-accent/5 font-semibold"
                                          )}
                                        />
                                      </div>
                                    </td>
                                    <td className="text-right font-semibold text-ink">
                                      {formatTenge(it.price * it.qty)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Панель правки состава: сообщение клиенту + одно
                              сохранение на все изменённые строки. */}
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="mt-2 rounded-lg border border-line bg-white p-3"
                          >
                            <div className="flex flex-wrap items-end gap-2">
                              <div className="min-w-[220px] flex-1">
                                <label className="mb-1 block text-[11px] text-muted">
                                  Сообщение клиенту (необязательно)
                                </label>
                                <input
                                  value={editNote}
                                  onChange={(e) => setEditNote(e.target.value)}
                                  placeholder="Например: на складе не хватило, отгрузим остаток позже"
                                  className="input py-1.5 text-xs"
                                />
                              </div>
                              <button
                                onClick={() => saveItems(r.id)}
                                disabled={savingItems}
                                className="btn-accent shrink-0 px-3 py-1.5 text-xs"
                              >
                                {savingItems ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  <Save size={13} />
                                )}
                                Сохранить состав
                              </button>
                            </div>
                            <p className="mt-1.5 text-[11px] text-muted">
                              Клиент увидит правку в «Моих заказах»: старое
                              количество будет зачёркнуто. Сумма заказа и долг
                              пересчитаются.
                            </p>
                            {itemsError && (
                              <div className="mt-1.5 text-[11px] text-accent">
                                {itemsError}
                              </div>
                            )}
                            {details[r.id].editedAt && (
                              <div className="mt-1.5 text-[11px] text-muted">
                                Последняя правка:{" "}
                                {formatDateTime(details[r.id].editedAt as string)}
                                {details[r.id].editNote
                                  ? ` · «${details[r.id].editNote}»`
                                  : ""}
                              </div>
                            )}
                          </div>

                          {details[r.id].comment && (
                            <div className="mt-2 rounded-lg border border-line bg-white px-3 py-2 text-xs leading-relaxed text-ink/90">
                              <span className="font-semibold text-muted">
                                Комментарий:{" "}
                              </span>
                              {details[r.id].comment}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
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

      {/* Hover preview of the order line's product photo. */}
      {preview && preview.item.imageUrl && (
        <div
          className="pointer-events-none fixed z-[70] rounded-xl border border-line bg-white p-2 shadow-2xl"
          style={{ top: preview.top, left: preview.left, width: PREVIEW_W }}
        >
          <div className="flex h-[180px] items-center justify-center overflow-hidden rounded-lg bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/image?u=${encodeURIComponent(preview.item.imageUrl)}`}
              alt={preview.item.sku}
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="mt-2 px-1">
            <div className="text-sm font-bold text-ink">
              {preview.item.sku}
            </div>
            <div className="line-clamp-2 text-[11px] leading-snug text-muted">
              {preview.item.name}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-accent">
              <ExternalLink size={10} /> Нажмите, чтобы открыть в каталоге
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
