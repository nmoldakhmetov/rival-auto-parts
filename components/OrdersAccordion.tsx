"use client";

import { useState } from "react";
import { ChevronDown, PencilLine } from "lucide-react";
import RepeatOrderButton from "@/components/RepeatOrderButton";
import { formatTenge, formatDateTime } from "@/lib/format";
import type { OrderStatus } from "@prisma/client";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  NEW: { label: "Новый", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  SENT: { label: "Отправлен", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  PROCESSING: {
    label: "В работе",
    cls: "bg-purple-50 text-purple-700 border-purple-200",
  },
  OUT_OF_STOCK: {
    label: "Нет в наличии",
    cls: "bg-orange-50 text-orange-700 border-orange-200",
  },
  ISSUED: {
    label: "Выдано",
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  COMPLETED: {
    label: "Выполнен",
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  CANCELLED: { label: "Отменён", cls: "bg-gray-100 text-muted border-line" },
};

export type ClientOrder = {
  id: string;
  no: string;
  status: OrderStatus;
  createdAt: string; // ISO
  total: number;
  comment: string | null;
  // Менеджер поправил состав (в 1С остаток бывает неактуальным).
  editedAt: string | null;
  editNote: string | null;
  editUnseen: boolean; // клиент ещё не открывал раздел после правки
  items: {
    id: string;
    productId: string | null;
    sku: string;
    name: string;
    price: number;
    qty: number;
    qtyOriginal: number | null; // сколько заказывал клиент до правки
  }[];
};

// История заказов раскрывающимися карточками — как в админском разделе
// «Заказы»: свёрнута только шапка, состав появляется по клику.
export default function OrdersAccordion({ orders }: { orders: ClientOrder[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {orders.map((o) => {
        const s = STATUS[o.status];
        const open = openId === o.id;
        return (
          <div
            key={o.id}
            className={cx(
              "overflow-hidden rounded-lg border bg-white",
              // Заказ, который правил менеджер и клиент ещё не открывал,
              // подсвечен целиком — мимо такого не пройдёшь.
              o.editUnseen ? "border-amber-300 ring-1 ring-amber-200" : "border-line"
            )}
          >
            <div
              onClick={() => setOpenId(open ? null : o.id)}
              title="Показать состав заказа"
              className={cx(
                "flex cursor-pointer flex-wrap items-center justify-between gap-2 bg-[#fafafa] px-3 py-2.5 transition-colors hover:bg-gray-100 sm:px-4",
                open && "border-b border-line"
              )}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <span
                  className={cx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-all duration-200",
                    open && "rotate-180 bg-accent/10 text-accent"
                  )}
                >
                  <ChevronDown size={15} />
                </span>
                <span className="font-bold text-ink">№{o.no}</span>
                <span className={`badge border ${s.cls}`}>{s.label}</span>
                {o.editedAt && (
                  <span
                    title="Менеджер изменил состав заказа"
                    className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-amber-700"
                  >
                    <PencilLine size={10} /> изменён
                  </span>
                )}
                <span className="text-xs text-muted">{o.items.length} поз.</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted">
                <span>{formatDateTime(o.createdAt)}</span>
                <span className="text-sm font-bold text-ink">
                  {formatTenge(o.total)}
                </span>
                {/* Кнопка не должна сворачивать/разворачивать карточку. */}
                <span onClick={(e) => e.stopPropagation()}>
                  <RepeatOrderButton
                    items={o.items.map((i) => ({
                      productId: i.productId,
                      qty: i.qty,
                    }))}
                  />
                </span>
              </div>
            </div>

            {open && (
              <div className="animate-fade-in-up">
                {/* Что именно изменилось и почему — первым делом. */}
                {o.editedAt && (
                  <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs leading-snug text-amber-800">
                    <PencilLine size={14} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold">
                        Менеджер изменил состав заказа{" "}
                        {formatDateTime(o.editedAt)}
                      </div>
                      {o.editNote && <div className="mt-0.5">{o.editNote}</div>}
                      <div className="mt-0.5 text-amber-700/80">
                        Изменённые строки отмечены ниже: зачёркнуто — как
                        заказывали вы, рядом — что отгружаем.
                      </div>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[560px]">
                    <tbody>
                      {o.items.map((i) => {
                        // Позицию правили: показываем и старое, и новое —
                        // и по количеству, и по сумме.
                        const changed =
                          i.qtyOriginal != null && i.qtyOriginal !== i.qty;
                        return (
                          <tr
                            key={i.id}
                            className={cx(changed && "bg-amber-50/60")}
                          >
                            <td className="w-32 font-semibold text-ink">
                              {i.sku}
                            </td>
                            <td className="text-muted">{i.name}</td>
                            <td className="w-28 text-right">
                              {formatTenge(i.price)}
                            </td>
                            <td className="w-24 text-center">
                              {changed ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-gray-400 line-through">
                                    ×{i.qtyOriginal}
                                  </span>
                                  <span className="font-bold text-amber-700">
                                    ×{i.qty}
                                  </span>
                                </span>
                              ) : (
                                <>× {i.qty}</>
                              )}
                            </td>
                            <td className="w-36 text-right font-semibold text-ink">
                              {changed ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="text-[11px] font-normal text-gray-400 line-through">
                                    {formatTenge(i.price * (i.qtyOriginal ?? 0))}
                                  </span>
                                  <span className="text-amber-700">
                                    {formatTenge(i.price * i.qty)}
                                  </span>
                                </span>
                              ) : (
                                formatTenge(i.price * i.qty)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {o.comment && (
                  <div className="border-t border-line px-4 py-2 text-xs text-muted">
                    Комментарий: {o.comment}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
