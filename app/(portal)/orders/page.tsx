import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Undo2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ReturnsClient from "@/components/ReturnsClient";
import OrdersAccordion from "@/components/OrdersAccordion";
import { productTitle } from "@/lib/product-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Мои заказы — Rival Auto Parts" };

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

  // Подпись позиции заказа: снимок применяемости, у старых заказов — из
  // товара. Клиенту служебное имя из 1С не показывается (lib/product-title):
  // у заказов до этого поля с удалённым товаром останется только артикул.
  const itemTitle = (i: {
    fullName: string | null;
    name: string;
    product?: { fullName: string | null } | null;
  }) =>
    productTitle(
      { fullName: i.fullName ?? i.product?.fullName ?? null, name: i.name },
      session.role
    );

  const orders = await prisma.order.findMany({
    where: { userId: session.sub },
    // Применяемость берём из снимка строки, а если заказ старше этого поля —
    // из самого товара. Клиент видит только её (см. lib/product-title).
    include: {
      items: { include: { product: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const returnsCount = isClient
    ? await prisma.return.count({ where: { userId: session.sub } })
    : 0;

  // Клиент открыл раздел — правки состава считаются увиденными. Пометка на
  // самих заказах остаётся (её видно в карточке), гаснет только счётчик в
  // меню. Снимаем ПОСЛЕ чтения заказов, чтобы этот заход ещё подсветился.
  const hadUnseenEdits =
    isClient && orders.some((o) => o.editedAt && !o.editSeenAt);
  if (hadUnseenEdits) {
    await prisma.order.updateMany({
      where: { userId: session.sub, editedAt: { not: null }, editSeenAt: null },
      data: { editSeenAt: new Date() },
    });
  }

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
          name: itemTitle(it),
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
        // Заказы свёрнуты до шапок, состав раскрывается по клику — как в
        // админском разделе «Заказы». Decimal/Date сериализуются заранее.
        <OrdersAccordion
          orders={orders.map((o) => ({
            id: o.id,
            no: o.id.slice(-6).toUpperCase(),
            status: o.status,
            createdAt: o.createdAt.toISOString(),
            total: Number(o.total),
            comment: o.comment,
            // Правка состава менеджером: пометка «изменён» держится, пока
            // клиент не откроет раздел (editSeenAt проставляется ниже).
            editedAt: o.editedAt ? o.editedAt.toISOString() : null,
            editNote: o.editNote,
            editUnseen: o.editedAt != null && o.editSeenAt == null,
            items: o.items.map((i) => ({
              id: i.id,
              productId: i.productId,
              sku: i.sku,
              name: itemTitle(i),
              price: Number(i.price),
              qty: i.qty,
              qtyOriginal: i.qtyOriginal,
            })),
          }))}
        />
      )}
    </div>
  );
}
