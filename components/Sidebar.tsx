"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  LayoutGrid,
  MapPin,
  ShoppingCart,
  ClipboardList,
  Users,
  Search,
  Box,
  Replace,
  Receipt,
  Undo2,
  BarChart3,
  Heart,
  Megaphone,
  Percent,
  Settings,
  LogOut,
} from "lucide-react";
import { useCart } from "@/store/cart";
import { formatTenge } from "@/lib/format";
import type { Role } from "@/lib/jwt";
import {
  canAccessSection,
  isStaff,
  type AdminSection,
} from "@/lib/permissions";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const roleLabel: Record<Role, string> = {
  ADMIN: "Администратор",
  RA: "Rival Auto",
  MANAGER: "Менеджер",
  ACCOUNTANT: "Бухгалтер",
  CLIENT: "Клиент",
};

// Admin nav, rendered per-role via canAccessSection (see lib/permissions.ts).
const ADMIN_NAV: {
  section: AdminSection;
  href: string;
  label: string;
  Icon: typeof LayoutGrid;
}[] = [
  { section: "overview", href: "/admin", label: "Обзор", Icon: Box },
  { section: "orders", href: "/admin/orders", label: "Заказы", Icon: Receipt },
  { section: "returns", href: "/admin/returns", label: "Возвраты", Icon: Undo2 },
  { section: "clients", href: "/admin/clients", label: "Клиенты", Icon: Users },
  { section: "discounts", href: "/admin/discounts", label: "Скидки", Icon: Percent },
  { section: "broadcasts", href: "/admin/broadcasts", label: "Рассылки", Icon: Megaphone },
  { section: "analogs", href: "/admin/analogs", label: "Аналоги", Icon: Replace },
  { section: "stats", href: "/admin/stats", label: "Статистика", Icon: BarChart3 },
  { section: "activity", href: "/admin/activity", label: "Избранное и корзины", Icon: Heart },
  { section: "search-logs", href: "/admin/search-logs", label: "История поиска", Icon: Search },
  { section: "settings", href: "/admin/settings", label: "Настройки", Icon: Settings },
];

export default function Sidebar({
  role,
  fullName,
  login,
  balance,
}: {
  role: Role;
  fullName: string;
  login: string;
  balance?: number | null;
}) {
  const pathname = usePathname();
  const count = useCart((s) => s.items.reduce((a, i) => a + i.qty, 0));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function NavLink({
    href,
    label,
    Icon,
    badge,
  }: {
    href: string;
    label: string;
    Icon: typeof LayoutGrid;
    badge?: number;
  }) {
    // Root routes ("/" and "/admin") match exactly so they don't stay
    // highlighted on nested pages (e.g. /admin/discounts).
    const active =
      href === "/" || href === "/admin"
        ? pathname === href
        : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={cx(
          "mx-2 flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-accent text-white"
            : "text-white/70 hover:bg-sidebar-hover hover:text-white"
        )}
      >
        <Icon size={18} />
        <span className="flex-1">{label}</span>
        {badge ? (
          <span className="badge bg-accent text-white">{badge}</span>
        ) : null}
      </Link>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-sidebar text-white">
      <Link
        href="/"
        title="На главную"
        className="flex items-center border-b border-sidebar-border px-5 py-[14px]"
      >
        <Image
          src="/logo-wide.jpg"
          alt="Rival Auto"
          width={190}
          height={67}
          priority
          className="h-auto w-[180px] mix-blend-screen"
        />
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto py-3">
        <NavLink href="/" label="Главная" Icon={Home} />
        <NavLink href="/catalog" label="Каталог" Icon={LayoutGrid} />
        <NavLink href="/#contacts" label="Контакты" Icon={MapPin} />
        {role === "CLIENT" && (
          <>
            <NavLink
              href="/cart"
              label="Корзина"
              Icon={ShoppingCart}
              badge={mounted && count > 0 ? count : undefined}
            />
            <NavLink href="/favorites" label="Избранное" Icon={Heart} />
            <NavLink href="/orders" label="Мои заказы" Icon={ClipboardList} />
            <NavLink href="/returns" label="Возвраты" Icon={Undo2} />
          </>
        )}

        {isStaff(role) && (
          <>
            <div className="px-5 pb-1 pt-4 text-[10px] uppercase tracking-wider text-white/30">
              Администрирование
            </div>
            {ADMIN_NAV.filter((n) => canAccessSection(role, n.section)).map(
              (n) => (
                <NavLink
                  key={n.section}
                  href={n.href}
                  label={n.label}
                  Icon={n.Icon}
                />
              )
            )}
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {role === "CLIENT" && balance != null && (
          <div
            className={cx(
              "mx-1 mb-2 flex items-center justify-between rounded-md px-3 py-2 text-xs",
              balance < 0
                ? "bg-accent/20 text-red-200"
                : "bg-white/5 text-white/70"
            )}
            title={
              balance < 0
                ? "Задолженность перед Rival Auto"
                : "Ваш текущий баланс"
            }
          >
            <span>{balance < 0 ? "Долг" : "Баланс"}</span>
            <span className="font-bold tabular-nums">
              {formatTenge(Math.abs(balance))}
            </span>
          </div>
        )}
        <div className="px-2 pb-2">
          <div className="truncate text-sm font-semibold">{fullName}</div>
          <div className="text-[11px] text-white/40">
            {login} · {roleLabel[role]}
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 transition-colors hover:bg-sidebar-hover hover:text-white"
        >
          <LogOut size={16} /> Выйти
        </button>
      </div>
    </aside>
  );
}
