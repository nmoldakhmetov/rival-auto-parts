"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  X,
  Megaphone,
  ChevronRight,
  ChevronLeft,
  LayoutGrid,
} from "lucide-react";

type BProduct = {
  id: string;
  sku: string;
  name: string;
  fullName: string | null;
  brand: string | null;
  price: number;
  oldPrice: number | null;
  discountPct: number;
  imageUrl: string | null;
  badge: "NEW" | "HIT" | null;
  totalQty: number;
};
type Broadcast = {
  id: string;
  title: string | null;
  text: string;
  createdAt: string;
  read: boolean;
  products: BProduct[];
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const SESSION_KEY = "rival_broadcasts_autoshown";
const POLL_MS = 45_000; // клиент узнаёт о новой рассылке без обновления страницы

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
    });
  } catch {
    return "";
  }
}

export default function BroadcastBell() {
  const router = useRouter();
  const [items, setItems] = useState<Broadcast[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const knownIdsRef = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/broadcasts").then((r) => r.json());
      const list: Broadcast[] = d.broadcasts ?? [];
      setItems(list);
      setUnread(d.unread ?? 0);
      setLoaded(true);

      const known = knownIdsRef.current;
      if (known === null) {
        // First load of this page: pop the panel once per browser session
        // if anything is still unread.
        knownIdsRef.current = new Set(list.map((b) => b.id));
        if (
          (d.unread ?? 0) > 0 &&
          typeof window !== "undefined" &&
          !sessionStorage.getItem(SESSION_KEY)
        ) {
          setOpen(true);
          sessionStorage.setItem(SESSION_KEY, "1");
        }
      } else {
        // Polling: a broadcast we've never seen → pop up immediately.
        const fresh = list.filter((b) => !known.has(b.id));
        if (fresh.length > 0) {
          for (const b of fresh) known.add(b.id);
          if (fresh.some((b) => !b.read)) {
            setDetailId(null);
            setOpen(true);
          }
        }
      }
    } catch {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  function markRead(b: Broadcast) {
    if (b.read) return;
    setItems((prev) =>
      prev.map((x) => (x.id === b.id ? { ...x, read: true } : x))
    );
    setUnread((u) => Math.max(0, u - 1));
    fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: b.id }),
    }).catch(() => {});
  }

  // Reading = opening a broadcast. With products → the FULL catalog-style
  // page (/broadcasts/[id]); text-only → a small detail view in the popup.
  function openBroadcast(b: Broadcast) {
    markRead(b);
    if (b.products.length > 0) {
      setOpen(false);
      setDetailId(null);
      router.push(`/broadcasts/${b.id}`);
    } else {
      setDetailId(b.id);
    }
  }

  const detail = detailId ? items.find((b) => b.id === detailId) : null;

  if (!loaded || items.length === 0) return null;

  return (
    <>
      <button
        onClick={() => {
          setDetailId(null);
          setOpen(true);
        }}
        title="Рассылки и акции"
        className={
          unread > 0
            ? "animate-bell relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent/40 bg-accent/5 text-accent shadow-sm"
            : "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition-all duration-200 hover:border-accent/40 hover:text-accent hover:shadow-sm"
        }
      >
        <Bell size={18} className={unread > 0 ? "animate-bell-swing" : ""} />
        {unread > 0 && (
          <span className="badge-pulse absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="my-auto w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-ink">
                {detail ? (
                  <>
                    <button
                      onClick={() => setDetailId(null)}
                      title="К списку рассылок"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-gray-100 hover:text-ink"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="truncate">
                      {detail.title || "Рассылка"}
                    </span>
                  </>
                ) : (
                  <>
                    <Megaphone size={18} className="shrink-0 text-accent" />{" "}
                    Новости и акции
                  </>
                )}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-gray-100 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            {detail ? (
              /* ── Detail (text-only broadcasts) ────────────────────── */
              <div className="max-h-[72vh] overflow-y-auto p-5">
                <div className="mb-1 text-[11px] text-muted">
                  {fmtDate(detail.createdAt)}
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">
                  {detail.text}
                </p>
              </div>
            ) : (
              /* ── List: titles only, click opens the broadcast ─────── */
              <div className="max-h-[72vh] space-y-2 overflow-y-auto p-3">
                {items.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => openBroadcast(b)}
                    title={
                      b.products.length > 0
                        ? "Откроется страницей с товарами — как каталог"
                        : undefined
                    }
                    className={cx(
                      "group flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md",
                      b.read
                        ? "border-line bg-white hover:border-gray-300 hover:bg-gray-50"
                        : "border-accent/40 bg-accent/5 hover:border-accent/60"
                    )}
                  >
                    <span
                      className={
                        b.read
                          ? "h-2.5 w-2.5 shrink-0 rounded-full bg-gray-200"
                          : "badge-pulse h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={
                            b.read
                              ? "truncate text-sm font-medium text-ink/80"
                              : "truncate text-sm font-bold text-ink"
                          }
                        >
                          {b.title || "Рассылка"}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted">
                          {fmtDate(b.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-xs text-muted">
                        {b.text}
                        {b.products.length > 0 &&
                          ` · товаров: ${b.products.length}`}
                      </span>
                    </span>
                    {b.products.length > 0 ? (
                      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold text-muted transition-all duration-200 group-hover:border-accent group-hover:bg-accent group-hover:text-white">
                        <LayoutGrid size={12} />
                        Перейти к товарам
                        <ChevronRight
                          size={13}
                          className="transition-transform duration-200 group-hover:translate-x-0.5"
                        />
                      </span>
                    ) : (
                      <ChevronRight
                        size={16}
                        className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
