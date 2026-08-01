"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Phone,
  MessageCircle,
  ChevronDown,
  Clock,
  Mail,
  UserRound,
  Menu,
  X,
} from "lucide-react";
import { useSearch } from "@/store/search";
import { useUi } from "@/store/ui";
import { normalizePhone } from "@/lib/whatsapp";
import {
  getSearchHistory,
  addSearchHistory,
  removeSearchHistory,
} from "@/lib/search-history";
import BroadcastBell from "@/components/BroadcastBell";

type Manager = {
  fullName: string;
  phone: string | null;
  email: string | null;
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const DEPTS = {
  retail: {
    label: "Розничный отдел",
    phone: "+7 (776) 710-30-17",
    tel: "+77767103017",
    email: "rauto.manager.4@gmail.com",
  },
  wholesale: {
    label: "Оптовый отдел",
    phone: "+7 (776) 710-30-14",
    tel: "+77767103014",
    email: "rivalautokz.1@gmail.com",
  },
};
const WA_NUMBER = "77767103014";

function Dept({ d }: { d: (typeof DEPTS)["retail"] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {d.label}
      </div>
      <a
        href={`tel:${d.tel}`}
        className="flex items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-accent"
      >
        <Phone size={14} className="text-accent" /> {d.phone}
      </a>
      <a
        href={`mailto:${d.email}`}
        className="mt-1 flex items-center gap-2 text-xs text-muted transition-colors hover:text-accent"
      >
        <Mail size={13} /> {d.email}
      </a>
    </div>
  );
}

export default function Header({ manager }: { manager?: Manager | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearch((s) => s.query);
  const setQuery = useSearch((s) => s.setQuery);
  const setSidebarOpen = useUi((s) => s.setSidebarOpen);
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Recent searches (YouTube-style): focusing the EMPTY search field drops
  // down the history; picking an entry fills the query and runs the search.
  const [searchFocused, setSearchFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const showHistory =
    searchFocused && query.trim() === "" && history.length > 0;

  function pickHistory(q: string) {
    addSearchHistory(q); // bump to the top
    setQuery(q);
    setSearchFocused(false);
    searchRef.current?.blur();
    // Off the catalog the query rides in the URL; on it the search is live.
    if (pathname !== "/catalog") {
      router.push(`/catalog?q=${encodeURIComponent(q)}`);
    }
  }

  // The green WhatsApp button prefers the client's own manager.
  const waNumber = manager?.phone ? normalizePhone(manager.phone) : WA_NUMBER;

  // Power-user hotkey: "/" focuses the global search from anywhere
  // (ignored while typing in another field), Escape blurs it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "Escape" && el === searchRef.current) {
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) addSearchHistory(q); // Enter commits the query into the history
    if (pathname === "/catalog") return; // the catalog searches live as you type
    // Carry the query in the URL so the route change doesn't reset it (see
    // SearchReset) and the search becomes a shareable deep link.
    router.push(q ? `/catalog?q=${encodeURIComponent(q)}` : "/catalog");
  }

  return (
    <header className="z-30 flex shrink-0 items-center gap-2 border-b border-line bg-white px-3 py-3 shadow-sm sm:gap-3 sm:px-6">
      {/* Burger — opens the sidebar drawer on mobile */}
      <button
        onClick={() => setSidebarOpen(true)}
        title="Меню"
        aria-label="Открыть меню"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition-all duration-200 hover:border-accent/40 hover:text-accent lg:hidden"
      >
        <Menu size={19} />
      </button>

      {/* Global search */}
      <form onSubmit={onSubmit} className="relative w-full max-w-2xl">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setHistory(getSearchHistory());
            setSearchFocused(true);
          }}
          onBlur={() => setSearchFocused(false)}
          placeholder="Поиск по артикулу, марке или применяемости…"
          className="w-full rounded-lg border border-line bg-gray-50 py-2.5 pl-11 pr-10 text-sm outline-none transition-all duration-200 focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent/20"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:block">
          /
        </kbd>

        {/* Recent searches dropdown. onMouseDown-preventDefault keeps the
            input focused, so the click lands before blur closes the list. */}
        {showHistory && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
          >
            <div className="px-3.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Недавние запросы
            </div>
            {history.map((h) => (
              <div key={h} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => pickHistory(h)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3.5 py-2 text-left text-sm text-ink transition-colors hover:bg-gray-50"
                >
                  <Clock size={15} className="shrink-0 text-muted" />
                  <span className="truncate">{h}</span>
                </button>
                <button
                  type="button"
                  title="Удалить из истории"
                  onClick={() => {
                    removeSearchHistory(h);
                    setHistory(getSearchHistory());
                  }}
                  className="mr-2 hidden h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-gray-100 hover:text-ink group-hover:flex"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </form>

      <div className="ml-auto flex items-center gap-2">
        {/* Broadcasts / promos (clients only — self-hides otherwise) */}
        <BroadcastBell />

        {/* Мобильная «лупа» вместо WhatsApp: фокусирует глобальный поиск —
            поднимается клавиатура и выпадашка недавних запросов. */}
        <button
          type="button"
          title="Поиск"
          aria-label="Открыть поиск"
          onClick={() => {
            searchRef.current?.focus();
            searchRef.current?.select();
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition-all duration-200 hover:border-accent/40 hover:text-accent sm:hidden"
        >
          <Search size={18} />
        </button>

        {/* WhatsApp — только на десктопе (на мобильном его место занимает
            поиск). Пишет менеджеру клиента, иначе — на номер отдела. */}
        <a
          href={`https://wa.me/${waNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          title={
            manager?.phone
              ? `Написать менеджеру (${manager.fullName}) в WhatsApp`
              : "Написать в WhatsApp"
          }
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/10 text-[#1FAF53] transition-all duration-200 hover:bg-[#25D366] hover:text-white hover:shadow-md sm:flex"
        >
          <MessageCircle size={18} />
        </a>

        {/* Phone + dropdown */}
        <div
          className="relative"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 transition-all duration-200 hover:border-accent/40 hover:shadow-sm"
          >
            <Phone size={16} className="text-accent" />
            <span className="hidden text-sm font-semibold text-ink lg:inline">
              {DEPTS.wholesale.phone}
            </span>
            <ChevronDown
              size={14}
              className={cx(
                "text-muted transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </button>

          <div
            className={cx(
              "absolute right-0 top-full z-40 mt-2 w-80 origin-top-right rounded-lg border border-line bg-white p-4 shadow-md transition-all duration-200",
              open
                ? "visible translate-y-0 opacity-100"
                : "invisible -translate-y-1 opacity-0"
            )}
          >
            {manager && (
              <>
                <div>
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                    <UserRound size={12} /> Ваш менеджер
                  </div>
                  <div className="text-sm font-semibold text-ink">
                    {manager.fullName}
                  </div>
                  {manager.phone && (
                    <a
                      href={`tel:${manager.phone}`}
                      className="mt-1 flex items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-accent"
                    >
                      <Phone size={14} className="text-accent" /> {manager.phone}
                    </a>
                  )}
                  {manager.email && (
                    <a
                      href={`mailto:${manager.email}`}
                      className="mt-1 flex items-center gap-2 text-xs text-muted transition-colors hover:text-accent"
                    >
                      <Mail size={13} /> {manager.email}
                    </a>
                  )}
                  {manager.phone && (
                    <a
                      href={`https://wa.me/${normalizePhone(manager.phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex w-fit items-center gap-1.5 rounded-lg bg-[#25D366]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1FAF53] transition-colors hover:bg-[#25D366] hover:text-white"
                    >
                      <MessageCircle size={14} /> Написать в WhatsApp
                    </a>
                  )}
                </div>
                <div className="my-3 border-t border-line" />
              </>
            )}
            <Dept d={DEPTS.retail} />
            <div className="my-3 border-t border-line" />
            <Dept d={DEPTS.wholesale} />
            <div className="my-3 border-t border-line" />
            <div className="flex items-start gap-2">
              <Clock size={15} className="mt-0.5 shrink-0 text-accent" />
              <div className="text-xs">
                <div className="font-semibold text-ink">Режим работы</div>
                <div className="text-muted">Вт – Вс: 09:00 – 18:00</div>
                <div className="text-muted">Понедельник — выходной</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
