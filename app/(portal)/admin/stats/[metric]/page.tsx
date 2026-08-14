import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingCart, Search, Eye } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatNum } from "@/lib/format";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Полная статистика по одной метрике: на главной странице раздела висят
// три карточки топ-15, а сюда ведёт «Показать всё» — тот же список
// целиком, страницами по 50. Скоуп менеджера («только свои клиенты»)
// повторяет главную страницу.

const PAGE_SIZE = 50;

const METRICS = {
  bought: {
    title: "Чаще всего покупают",
    Icon: ShoppingCart,
    columns: ["Артикул", "Наименование", "Куплено"],
  },
  searched: {
    title: "Чаще всего ищут",
    Icon: Search,
    columns: ["Запрос", "", "Раз искали"],
  },
  viewed: {
    title: "Чаще всего смотрят",
    Icon: Eye,
    columns: ["Артикул", "Наименование", "Просмотров"],
  },
} as const;

type Metric = keyof typeof METRICS;

export function generateMetadata({ params }: { params: { metric: string } }) {
  const m = METRICS[params.metric as Metric];
  return { title: `${m?.title ?? "Статистика"} — Админ-панель` };
}

export default async function StatsMetricPage({
  params,
  searchParams,
}: {
  params: { metric: string };
  searchParams: { page?: string };
}) {
  const metric = params.metric as Metric;
  const meta = METRICS[metric];
  if (!meta) notFound();

  const session = await getSession();
  const mgrId = session?.role === "MANAGER" ? session.sub : null;
  const wantedPage = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  // Номер страницы приходит из адреса, и его легко перебить руками. Держим
  // его в границах: «Показано 51–6 из 6» — не то, что должен увидеть человек.
  const clamp = (total: number) =>
    Math.min(wantedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)));

  // Строк в группировке немного (различные товары/запросы), поэтому берём
  // весь список и режем страницу в памяти: groupBy не умеет отдавать общее
  // число групп, а второй агрегирующий запрос стоил бы столько же.
  let rows: { main: string; sub?: string; value: string }[] = [];
  let total = 0;
  let page = wantedPage;

  if (metric === "bought") {
    const groups = await prisma.orderItem.groupBy({
      by: ["sku", "name"],
      where: mgrId ? { order: { user: { managerId: mgrId } } } : {},
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
    });
    total = groups.length;
    page = clamp(total);
    rows = groups
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map((g) => ({
        main: g.sku,
        sub: g.name,
        value: `${formatNum(g._sum.qty ?? 0)} шт`,
      }));
  } else if (metric === "searched") {
    const groups = await prisma.searchLog.groupBy({
      by: ["query"],
      where: mgrId ? { user: { managerId: mgrId } } : {},
      _count: { _all: true },
      orderBy: { _count: { query: "desc" } },
    });
    total = groups.length;
    page = clamp(total);
    rows = groups
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map((g) => ({ main: `«${g.query}»`, value: formatNum(g._count._all) }));
  } else {
    const groups = await prisma.productView.groupBy({
      by: ["productId"],
      where: mgrId ? { user: { managerId: mgrId } } : {},
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
    });
    total = groups.length;
    page = clamp(total);
    const pageGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const products = await prisma.product.findMany({
      where: { id: { in: pageGroups.map((g) => g.productId) } },
      select: { id: true, sku: true, name: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    rows = pageGroups.map((g) => ({
      main: byId.get(g.productId)?.sku ?? "—",
      sub: byId.get(g.productId)?.name ?? "(товар удалён)",
      value: formatNum(g._count._all),
    }));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="px-6 py-6">
      <Link
        href="/admin/stats"
        className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft size={13} /> К сводке
      </Link>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-ink">
        <meta.Icon size={18} className="text-accent" /> {meta.title}
      </h1>
      <p className="mb-4 text-xs text-muted">
        {total === 0
          ? "Данных пока нет"
          : `Показано ${from}–${to} из ${formatNum(total)}`}
      </p>

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="data-table min-w-[560px]">
          <thead>
            <tr>
              <th className="w-14">№</th>
              <th className="w-40">{meta.columns[0]}</th>
              <th>{meta.columns[1]}</th>
              <th className="w-32 text-right">{meta.columns[2]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-16 text-center text-sm text-muted">
                  Данных пока нет
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.main}-${i}`}>
                <td className="text-xs font-bold text-gray-300">
                  {(page - 1) * PAGE_SIZE + i + 1}
                </td>
                <td className="font-semibold text-ink">{r.main}</td>
                <td className="text-muted">{r.sub ?? ""}</td>
                <td className="text-right font-bold tabular-nums text-accent">
                  {r.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <PageLink
            metric={metric}
            page={page - 1}
            disabled={page <= 1}
            label="Назад"
          />
          <span className="text-xs text-muted">
            {page} / {totalPages}
          </span>
          <PageLink
            metric={metric}
            page={page + 1}
            disabled={page >= totalPages}
            label="Вперёд"
          />
        </div>
      )}
    </div>
  );
}

function PageLink({
  metric,
  page,
  disabled,
  label,
}: {
  metric: string;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded border border-line px-2.5 py-1 text-xs text-gray-300">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`/admin/stats/${metric}?page=${page}`}
      className="rounded border border-line px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-accent/40 hover:text-accent"
    >
      {label}
    </Link>
  );
}
