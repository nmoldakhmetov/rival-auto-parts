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
  BadgePercent,
  Gift,
  Settings,
  LogOut,
  KeyRound,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { useCart } from "@/store/cart";
import { useUi } from "@/store/ui";
import { formatTenge } from "@/lib/format";
import {
  earnedGiftQty,
  totalGiftUnits,
  type GiftRuleLite,
} from "@/lib/gift-earn";
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
  { section: "gifts", href: "/admin/gifts", label: "Подарки", Icon: Gift },
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
  const cartItems = useCart((s) => s.items);
  const count = cartItems.reduce((a, i) => a + i.qty, 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Mobile drawer: opened by the Header burger, closed by navigation,
  // the backdrop or the ✕ button. On lg+ the sidebar is always visible.
  const sidebarOpen = useUi((s) => s.sidebarOpen);
  const setSidebarOpen = useUi((s) => s.setSidebarOpen);
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  // Desktop mini-mode (w-60 → w-20), persisted in localStorage. `mini` is
  // gated on `mounted` so SSR and the first client render match (no hydration
  // mismatch); transitions turn on shortly AFTER the persisted state applies,
  // so a reload doesn't replay the collapse animation.
  const collapsed = useUi((s) => s.collapsed);
  const toggleCollapsed = useUi((s) => s.toggleCollapsed);
  const mini = mounted && collapsed;
  const [transOn, setTransOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTransOn(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Gift promos → «+ подарок» indicator on the cart entry (clients only).
  const [giftRules, setGiftRules] = useState<GiftRuleLite[]>([]);
  useEffect(() => {
    if (role !== "CLIENT") return;
    fetch("/api/gifts")
      .then((r) => r.json())
      .then((d) => setGiftRules(d.rules ?? []))
      .catch(() => {});
  }, [role]);
  const giftUnits = totalGiftUnits(
    earnedGiftQty(
      giftRules,
      new Map(cartItems.map((i) => [i.productId, i.qty]))
    )
  );

  // Модалка смены своего пароля (доступна из блока пользователя).
  const [pwdOpen, setPwdOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function NavLink({
    href,
    label,
    Icon,
    badge,
    giftUnits,
    highlight,
  }: {
    href: string;
    label: string;
    Icon: typeof LayoutGrid;
    badge?: number;
    // Earned promo gifts → green «🎁 +N» pill next to the cart counter.
    giftUnits?: number;
    // Accent entry (e.g. «Акции»): red tint so the eye lands on it.
    highlight?: boolean;
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
        title={label}
        className={cx(
          "relative mx-2 flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
          active
            ? "bg-accent text-white"
            : highlight
              ? "bg-accent/15 font-semibold text-accent-light hover:bg-accent/25 hover:text-white"
              : "text-white/70 hover:bg-sidebar-hover hover:text-white",
          // Mini mode (desktop only): centered icon, no label.
          mini && "lg:justify-center lg:gap-0 lg:px-0"
        )}
      >
        <Icon size={18} className="shrink-0" />
        <span className={cx("flex-1 truncate", mini && "lg:hidden")}>
          {label}
        </span>
        {giftUnits ? (
          <span
            title={`Подарки по акции: ${giftUnits} шт`}
            className={cx(
              "flex items-center gap-0.5 rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white",
              mini && "lg:hidden"
            )}
          >
            <Gift size={10} /> +{giftUnits}
          </span>
        ) : null}
        {badge ? (
          <>
            {/* Expanded (and the mobile drawer): a regular pill at the end. */}
            <span
              className={cx("badge bg-accent text-white", mini && "lg:hidden")}
            >
              {badge}
            </span>
            {/* Mini mode: a small counter pinned to the icon's corner. */}
            {mini && (
              <span className="absolute right-2 top-1 hidden h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold leading-none text-white ring-2 ring-sidebar lg:flex">
                {badge}
              </span>
            )}
          </>
        ) : null}
      </Link>
    );
  }

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm lg:hidden"
          aria-hidden
        />
      )}

      <aside
        className={cx(
          // Mobile: fixed drawer sliding in from the left (always full width).
          // h-[100dvh], а не h-screen: на iOS Safari 100vh больше видимой
          // области (в неё входят панели браузера), из-за чего низ меню с
          // кнопкой «Выйти» уезжал под нижнюю панель и был недостижим.
          "fixed inset-y-0 left-0 z-[120] flex h-[100dvh] w-60 flex-col bg-sidebar text-white",
          transOn && "transition-all duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          // Desktop (lg+): always-visible column, collapsible to a mini rail.
          // z-40 keeps the edge toggle above the header (z-30) it pokes into.
          "lg:sticky lg:top-0 lg:z-40 lg:shrink-0 lg:translate-x-0 lg:shadow-none",
          mini ? "lg:w-20" : "lg:w-60"
        )}
      >
        <div className="relative flex items-center border-b border-sidebar-border">
          <Link
            href="/"
            title="На главную"
            className={cx(
              "flex min-w-0 flex-1 items-center px-5 py-[14px]",
              mini && "lg:justify-center lg:px-0"
            )}
          >
            {/* Wide logo — expanded desktop and the mobile drawer. */}
            <Image
              src="/logo-wide.jpg"
              alt="Rival Auto"
              width={190}
              height={67}
              priority
              className={cx(
                "h-auto w-[180px] mix-blend-screen",
                mini && "lg:hidden"
              )}
            />
            {/* Compact logo — mini mode only. */}
            <Image
              src="/logo-compact.jpg"
              alt="Rival Auto"
              width={44}
              height={44}
              priority
              className={cx(
                "hidden h-11 w-11 mix-blend-screen",
                mini && "lg:block"
              )}
            />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            title="Закрыть меню"
            className="mr-3 flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-sidebar-hover hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>

          {/* Desktop collapse toggle on the sidebar edge: a quiet square in
              the sidebar's own palette (no white circle, no heavy shadow). */}
          <button
            onClick={toggleCollapsed}
            title={mini ? "Развернуть меню" : "Свернуть меню"}
            aria-label={mini ? "Развернуть меню" : "Свернуть меню"}
            className="absolute -right-3 top-1/2 z-20 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-sidebar-border/60 bg-sidebar-active text-gray-400 shadow-sm transition-colors duration-200 hover:bg-sidebar-hover hover:text-white lg:flex"
          >
            {mini ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden py-3">
          <NavLink href="/" label="Главная" Icon={Home} />
          <NavLink href="/catalog" label="Каталог" Icon={LayoutGrid} />
          <NavLink href="/promotions" label="Акции" Icon={BadgePercent} highlight />
          <NavLink href="/#contacts" label="Контакты" Icon={MapPin} />
          {role === "CLIENT" && (
            <>
              <NavLink
                href="/cart"
                label="Корзина"
                Icon={ShoppingCart}
                badge={mounted && count > 0 ? count : undefined}
                giftUnits={mounted && giftUnits > 0 ? giftUnits : undefined}
              />
              <NavLink href="/favorites" label="Избранное" Icon={Heart} />
              {/* «Возвраты» живут вкладкой внутри «Моих заказов» */}
              <NavLink href="/orders" label="Мои заказы" Icon={ClipboardList} />
            </>
          )}

          {isStaff(role) && (
            <>
              {/* Section label collapses into a thin divider in mini mode. */}
              <div
                className={cx(
                  "px-5 pb-1 pt-4 text-[10px] uppercase tracking-wider text-white/30",
                  mini && "lg:hidden"
                )}
              >
                Администрирование
              </div>
              {mini && (
                <div className="mx-5 mb-1 mt-4 hidden border-t border-sidebar-border lg:block" />
              )}
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
                // Положительный баланс = ДОЛГ (сумма неоплаченных заказов),
                // как в карточке клиента в админке. Раньше здесь стояло
                // обратное сравнение, и реальный долг показывался клиенту
                // нейтральным «Балансом».
                balance > 0
                  ? "bg-accent/20 text-red-200"
                  : "bg-white/5 text-white/70",
                mini && "lg:hidden"
              )}
              title={
                balance > 0
                  ? "Задолженность перед Rival Auto"
                  : "Ваш текущий баланс"
              }
            >
              <span>{balance > 0 ? "Долг" : "Баланс"}</span>
              <span className="font-bold tabular-nums">
                {formatTenge(Math.abs(balance))}
              </span>
            </div>
          )}
          {/* Имя + логин, справа — ключик «Сменить пароль»: место, где
              пользователь и так ищет свои настройки. Доступно всем ролям. */}
          <div
            className={cx(
              "flex items-center gap-2 px-2 pb-2",
              mini && "lg:hidden"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{fullName}</div>
              <div className="truncate text-[11px] text-white/40">
                {login} · {roleLabel[role]}
              </div>
            </div>
            <button
              onClick={() => setPwdOpen(true)}
              title="Сменить пароль"
              aria-label="Сменить пароль"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-sidebar-hover hover:text-white"
            >
              <KeyRound size={16} />
            </button>
          </div>
          {/* В свёрнутом меню подписи не видно — ключик становится отдельной
              строкой-иконкой, как «Выйти». */}
          {mini && (
            <button
              onClick={() => setPwdOpen(true)}
              title="Сменить пароль"
              aria-label="Сменить пароль"
              className="hidden w-full items-center justify-center rounded-md px-0 py-2 text-white/70 transition-colors hover:bg-sidebar-hover hover:text-white lg:flex"
            >
              <KeyRound size={16} className="shrink-0" />
            </button>
          )}
          <button
            onClick={logout}
            title="Выйти"
            className={cx(
              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-white/70 transition-colors hover:bg-sidebar-hover hover:text-white",
              mini && "lg:justify-center lg:gap-0 lg:px-0"
            )}
          >
            <LogOut size={16} className="shrink-0" />
            <span className={cx(mini && "lg:hidden")}>Выйти</span>
          </button>
        </div>
      </aside>
      {pwdOpen && <ChangePasswordDialog onClose={() => setPwdOpen(false)} />}
    </>
  );
}
