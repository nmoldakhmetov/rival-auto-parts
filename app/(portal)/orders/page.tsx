import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatTenge, formatDateTime } from "@/lib/format";
import type { OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Мои заказы — Rival Auto Parts" };

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

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const orders = await prisma.order.findMany({
    where: { userId: session.sub },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="px-6 py-6">
      <h1 className="mb-4 text-xl font-bold text-ink">Мои заказы</h1>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-line bg-white py-20 text-center">
          <ClipboardList size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium text-ink">Заказов пока нет</p>
          <Link
            href="/"
            className="mt-3 inline-block text-sm font-semibold text-accent hover:underline"
          >
            Перейти в каталог →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const s = STATUS[o.status];
            return (
              <div
                key={o.id}
                className="overflow-hidden rounded-lg border border-line bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-[#fafafa] px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-ink">
                      №{o.id.slice(-6).toUpperCase()}
                    </span>
                    <span className={`badge border ${s.cls}`}>{s.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span>{formatDateTime(o.createdAt)}</span>
                    <span className="text-sm font-bold text-ink">
                      {formatTenge(Number(o.total))}
                    </span>
                  </div>
                </div>
                <table className="data-table">
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id}>
                        <td className="w-32 font-semibold text-ink">{i.sku}</td>
                        <td className="text-muted">{i.name}</td>
                        <td className="w-28 text-right">
                          {formatTenge(Number(i.price))}
                        </td>
                        <td className="w-20 text-center">× {i.qty}</td>
                        <td className="w-32 text-right font-semibold text-ink">
                          {formatTenge(Number(i.price) * i.qty)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {o.comment && (
                  <div className="border-t border-line px-4 py-2 text-xs text-muted">
                    Комментарий: {o.comment}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
