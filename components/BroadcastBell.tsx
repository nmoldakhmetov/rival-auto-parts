"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, X, Megaphone } from "lucide-react";
import { useSearch } from "@/store/search";
import { formatTenge } from "@/lib/format";

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
};
type Broadcast = {
  id: string;
  title: string | null;
  text: string;
  createdAt: string;
  read: boolean;
  products: BProduct[];
};

const SESSION_KEY = "rival_broadcasts_autoshown";

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
  const setQuery = useSearch((s) => s.setQuery);
  const [items, setItems] = useState<Broadcast[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const markAllRead = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/broadcasts")
      .then((r) => r.json())
      .then((d) => {
        const list: Broadcast[] = d.broadcasts ?? [];
        setItems(list);
        setUnread(d.unread ?? 0);
        setLoaded(true);
        // Auto-popup new broadcasts once per browser session.
        if (
          (d.unread ?? 0) > 0 &&
          typeof window !== "undefined" &&
          !sessionStorage.getItem(SESSION_KEY)
        ) {
          setOpen(true);
          sessionStorage.setItem(SESSION_KEY, "1");
        }
      })
      .catch(() => setLoaded(true));
  }, []);

  // When the panel opens, everything shown counts as read.
  useEffect(() => {
    if (!open || unread === 0) return;
    const unreadIds = items.filter((b) => !b.read).map((b) => b.id);
    markAllRead(unreadIds);
    setItems((prev) => prev.map((b) => ({ ...b, read: true })));
    setUnread(0);
  }, [open, unread, items, markAllRead]);

  function openProduct(sku: string) {
    setQuery(sku);
    setOpen(false);
    router.push("/catalog");
  }

  if (!loaded || items.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Рассылки и акции"
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition-all duration-200 hover:border-accent/40 hover:text-accent hover:shadow-sm"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
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
            className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                <Megaphone size={18} className="text-accent" /> Новости и акции
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-gray-100 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
              {items.map((b) => (
                <article
                  key={b.id}
                  className="rounded-xl border border-line bg-gray-50/60 p-4"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    {b.title ? (
                      <h3 className="text-sm font-bold text-ink">{b.title}</h3>
                    ) : (
                      <span />
                    )}
                    <span className="shrink-0 text-[11px] text-muted">
                      {fmtDate(b.createdAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">
                    {b.text}
                  </p>

                  {b.products.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {b.products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => openProduct(p.sku)}
                          className="group flex flex-col overflow-hidden rounded-lg border border-line bg-white text-left transition-all hover:border-accent/40 hover:shadow-md"
                        >
                          <div className="relative aspect-square bg-gray-100">
                            {p.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/image?u=${encodeURIComponent(
                                  p.imageUrl
                                )}`}
                                alt={p.sku}
                                className="h-full w-full object-contain p-2 transition-transform group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[11px] text-muted">
                                нет фото
                              </div>
                            )}
                            {p.discountPct > 0 && (
                              <span className="absolute left-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                                −{p.discountPct}%
                              </span>
                            )}
                          </div>
                          <div className="flex flex-1 flex-col p-2">
                            <div className="line-clamp-2 text-[12px] font-medium text-ink">
                              {p.fullName || p.sku}
                            </div>
                            <div className="mt-auto pt-1">
                              {p.oldPrice != null && (
                                <span className="mr-1 text-[11px] text-muted line-through">
                                  {formatTenge(p.oldPrice)}
                                </span>
                              )}
                              <span className="text-[13px] font-bold text-accent">
                                {formatTenge(p.price)}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
