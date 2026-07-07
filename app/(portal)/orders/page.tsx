import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Undo2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatTenge, formatDateTime } from "@/lib/format";
import RepeatOrderButton from "@/components/RepeatOrderButton";
import ReturnsClient from "@/components/ReturnsClient";
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

// Tab pill (server-rendered link; the active tab lives in the URL, so tabs
// are shareable and the back button works).
function TabLink({
  href,
  active,
  Icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  Icon: typeof ClipboardList;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "flex items-center gap-1.5 rounded-md border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm"
          : "flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 hover:text-ink"
      }
    >
      <Icon size={14} />
      {label}
      <span className={active ? "text-white/80" : "text-gray-400"}>
        ({count})
      </span>
    </Link>
  );
}

// «Мои заказы» with two tabs: order history and the client's returns (the
// returns section moved here from a standalone sidebar entry).
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const isClient = session.role === "CLIENT";
  const tab = isClient && searchParams.tab === "returns" ? "returns" : "orders";

  const orders = await prisma.order.findMany({
    where: { userId: session.sub },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  const returnsCount = isClient
    ? await prisma.return.count({ where: { userId: session.sub } })
    : 0;

  // ─── Returns tab data (only when it is actually open) ────────────────────
  const orderItems: {
    productId: string | null;
    sku: string;
    name: string;
    price: number;
  }[] = [];
  let warehouses: string[] = [];
  if (tab === "returns") {
    const seen = new Set<string>();
    for (const o of orders.slice(0, 50)) {
      for (const it of o.items) {
        const key = it.productId ?? it.sku;
        if (seen.has(key)) continue;
        seen.add(key);
        orderItems.push({
          productId: it.productId,
          sku: it.sku,
          name: it.name,
          price: Number(it.price),
        });
      }
    }
    const access = await prisma.clientWarehouseAccess.findMany({
      where: { userId: session.sub },
      include: { warehouse: { select: { name: true } } },
    });
    warehouses = access.map((a) => a.warehouse.name);
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="mb-3 text-xl font-bold text-ink">Мои заказы</h1>

      {isClient && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <TabLink
            href="/orders"
            active={tab === "orders"}
            Icon={ClipboardList}
            label="История заказов"
            count={orders.length}
          />
          <TabLink
            href="/orders?tab=returns"
            active={tab === "returns"}
            Icon={Undo2}
            label="Мои возвраты"
            count={returnsCount}
          />
        </div>
      )}

      {tab === "returns" ? (
        <div className="max-w-5xl">
          <ReturnsClient
            orderItems={orderItems}
            warehouses={warehouses}
            embedded
          />
        </div>
      ) : orders.length === 0 ? (
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
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{formatDateTime(o.createdAt)}</span>
                    <span className="text-sm font-bold text-ink">
                      {formatTenge(Number(o.total))}
                    </span>
                    <RepeatOrderButton
                      items={o.items.map((i) => ({
                        productId: i.productId,
                        qty: i.qty,
                      }))}
                    />
                  </div>
                </div>
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
                </div>
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
