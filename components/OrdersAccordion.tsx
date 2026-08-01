"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
  items: {
    id: string;
    productId: string | null;
    sku: string;
    name: string;
    price: number;
    qty: number;
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
            className="overflow-hidden rounded-lg border border-line bg-white"
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
                <div className="overflow-x-auto">
                  <table className="data-table min-w-[560px]">
                    <tbody>
                      {o.items.map((i) => (
                        <tr key={i.id}>
                          <td className="w-32 font-semibold text-ink">
                            {i.sku}
                          </td>
                          <td className="text-muted">{i.name}</td>
                          <td className="w-28 text-right">
                            {formatTenge(i.price)}
                          </td>
                          <td className="w-20 text-center">× {i.qty}</td>
                          <td className="w-32 text-right font-semibold text-ink">
                            {formatTenge(i.price * i.qty)}
                          </td>
                        </tr>
                      ))}
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
