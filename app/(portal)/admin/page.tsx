import Link from "next/link";
import {
  Users,
  UserCog,
  Package,
  Warehouse as WarehouseIcon,
  ClipboardList,
  Search,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateTime, formatNum } from "@/lib/format";
import SyncPanel from "@/components/admin/SyncPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Обзор — Админ-панель" };

export default async function AdminHome() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [clients, managers, products, warehouses, orders, searchesToday] =
    await Promise.all([
      prisma.user.count({ where: { role: "CLIENT" } }),
      prisma.user.count({ where: { role: "MANAGER" } }),
      prisma.product.count(),
      prisma.warehouse.count(),
      prisma.order.count(),
      prisma.searchLog.count({ where: { createdAt: { gte: startOfToday } } }),
    ]);

  const recentSearches = await prisma.searchLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { user: { select: { fullName: true, login: true } } },
  });

  const stats = [
    { label: "Клиенты", value: clients, Icon: Users, href: "/admin/clients" },
    { label: "Менеджеры", value: managers, Icon: UserCog, href: "/admin/clients" },
    { label: "Товары", value: products, Icon: Package, href: "/" },
    { label: "Склады", value: warehouses, Icon: WarehouseIcon, href: "/" },
    { label: "Заказы", value: orders, Icon: ClipboardList, href: "/admin" },
    {
      label: "Поисков сегодня",
      value: searchesToday,
      Icon: Search,
      href: "/admin/search-logs",
    },
  ];

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Обзор</h1>
      <p className="mb-5 text-xs text-muted">Сводка по порталу</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-line bg-white p-4 transition-shadow hover:shadow-sm"
          >
            <s.Icon size={18} className="mb-2 text-accent" />
            <div className="text-2xl font-bold text-ink">
              {formatNum(s.value)}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted">
              {s.label}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 1С sync */}
        <div className="rounded-lg border border-line bg-white p-5">
          <h2 className="mb-1 text-sm font-bold text-ink">
            Синхронизация с 1С
          </h2>
          <p className="mb-3 break-all text-[11px] text-muted">
            Источник: {process.env.ONEC_API_URL ?? "не настроен"}
          </p>
          <SyncPanel />
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Загружает товары, склады и остатки. Существующие записи обновляются
            по коду 1С.
          </p>
        </div>

        {/* Recent searches */}
        <div className="rounded-lg border border-line bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">Последние запросы</h2>
            <Link
              href="/admin/search-logs"
              className="text-xs font-semibold text-accent hover:underline"
            >
              Все →
            </Link>
          </div>
          {recentSearches.length === 0 ? (
            <p className="text-xs text-muted">Запросов пока нет.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentSearches.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">
                    <span className="font-medium text-ink">«{s.query}»</span>{" "}
                    <span className="text-muted">
                      — {s.user?.fullName ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-muted">
                    {s.resultsCount} рез. · {formatDateTime(s.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
