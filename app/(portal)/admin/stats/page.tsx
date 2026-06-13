import {
  ShoppingCart,
  Search,
  Eye,
  TrendingUp,
  Package,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatNum } from "@/lib/format";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Статистика — Админ-панель" };

export default async function StatsPage() {
  const session = await getSession();
  // Manager → statistics limited to their own clients' activity.
  const mgrId = session?.role === "MANAGER" ? session.sub : null;
  const orderItemScope = mgrId
    ? { order: { user: { managerId: mgrId } } }
    : {};
  const userScope = mgrId ? { user: { managerId: mgrId } } : {};
  const orderScope = mgrId ? { user: { managerId: mgrId } } : {};

  const [
    boughtRaw,
    searchedRaw,
    viewedRaw,
    ordersCount,
    searchesCount,
    viewsCount,
  ] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ["sku", "name"],
      where: orderItemScope,
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
      take: 15,
    }),
    prisma.searchLog.groupBy({
      by: ["query"],
      where: userScope,
      _count: { _all: true },
      orderBy: { _count: { query: "desc" } },
      take: 15,
    }),
    prisma.productView.groupBy({
      by: ["productId"],
      where: userScope,
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
      take: 15,
    }),
    prisma.order.count({ where: orderScope }),
    prisma.searchLog.count({ where: userScope }),
    prisma.productView.count({ where: userScope }),
  ]);

  const viewedProducts = await prisma.product.findMany({
    where: { id: { in: viewedRaw.map((v) => v.productId) } },
    select: { id: true, sku: true, name: true },
  });
  const pmap = new Map(viewedProducts.map((p) => [p.id, p]));
  const viewed = viewedRaw.map((v) => ({
    sku: pmap.get(v.productId)?.sku ?? "—",
    name: pmap.get(v.productId)?.name ?? "(удалён)",
    count: v._count._all,
  }));

  const bought = boughtRaw.map((b) => ({
    sku: b.sku,
    name: b.name,
    qty: b._sum.qty ?? 0,
  }));
  const searched = searchedRaw.map((s) => ({
    query: s.query,
    count: s._count._all,
  }));

  const stats = [
    { label: "Заказов", value: ordersCount, Icon: ShoppingCart },
    { label: "Поисков", value: searchesCount, Icon: Search },
    { label: "Просмотров", value: viewsCount, Icon: Eye },
  ];

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Статистика товаров</h1>
      <p className="mb-5 text-xs text-muted">
        Что покупают, ищут и просматривают чаще всего.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-3 sm:max-w-md">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-line bg-white p-4"
          >
            <s.Icon size={16} className="mb-1.5 text-accent" />
            <div className="text-2xl font-bold text-ink">
              {formatNum(s.value)}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <TopCard title="Чаще всего покупают" Icon={ShoppingCart}>
          {bought.length === 0 ? (
            <Empty />
          ) : (
            bought.map((b, i) => (
              <Row
                key={b.sku + i}
                rank={i + 1}
                main={b.sku}
                sub={b.name}
                value={`${formatNum(b.qty)} шт`}
              />
            ))
          )}
        </TopCard>

        <TopCard title="Чаще всего ищут" Icon={Search}>
          {searched.length === 0 ? (
            <Empty />
          ) : (
            searched.map((s, i) => (
              <Row
                key={s.query + i}
                rank={i + 1}
                main={`«${s.query}»`}
                value={`${formatNum(s.count)}`}
              />
            ))
          )}
        </TopCard>

        <TopCard title="Чаще всего смотрят" Icon={Eye}>
          {viewed.length === 0 ? (
            <Empty hint="Просмотры считаются при открытии фото товара." />
          ) : (
            viewed.map((v, i) => (
              <Row
                key={v.sku + i}
                rank={i + 1}
                main={v.sku}
                sub={v.name}
                value={`${formatNum(v.count)}`}
              />
            ))
          )}
        </TopCard>
      </div>

      <p className="mt-6 text-xs text-muted">
        <TrendingUp size={12} className="mr-1 inline" />
        История поиска по каждому клиенту — в разделе{" "}
        <a href="/admin/search-logs" className="font-medium text-accent hover:underline">
          «История поиска»
        </a>{" "}
        (есть фильтр по клиенту).
      </p>
    </div>
  );
}

function TopCard({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof Package;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-line bg-gray-50 px-4 py-2.5">
        <Icon size={15} className="text-accent" />
        <h2 className="text-sm font-bold text-ink">{title}</h2>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </div>
  );
}

function Row({
  rank,
  main,
  sub,
  value,
}: {
  rank: number;
  main: string;
  sub?: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="w-5 shrink-0 text-center text-xs font-bold text-gray-300">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{main}</div>
        {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
      </div>
      <span className="shrink-0 text-sm font-bold text-accent">{value}</span>
    </div>
  );
}

function Empty({ hint }: { hint?: string }) {
  return (
    <div className="px-4 py-8 text-center text-xs text-muted">
      Данных пока нет.{hint ? ` ${hint}` : ""}
    </div>
  );
}
