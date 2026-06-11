"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Check,
  ImageOff,
  Loader2,
  PackageSearch,
  TriangleAlert,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  List,
  LayoutGrid,
  ShoppingCart,
  ZoomIn,
  Replace,
  Heart,
  Pin,
  Star,
  Flame,
} from "lucide-react";
import { useCart } from "@/store/cart";
import { useSearch } from "@/store/search";
import { formatTenge, formatNum, formatDiscount } from "@/lib/format";
import { visibleCategory } from "@/lib/categories";
import CartQtySelector from "@/components/CartQtySelector";
import type { CatalogRow } from "@/lib/types";
import type { Role } from "@/lib/jwt";
import CategoryTree, { type CatNode } from "@/components/CategoryTree";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Records a product-card view for statistics (fire-and-forget).
function trackView(productId: string) {
  fetch("/api/track/view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  }).catch(() => {});
}

function BadgeLabel({ badge }: { badge: "NEW" | "HIT" }) {
  const cfg =
    badge === "NEW"
      ? { label: "Новинка", Icon: Star, cls: "bg-green-500" }
      : { label: "Хит продаж", Icon: Flame, cls: "bg-amber-500" };
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center gap-1 rounded-full py-[3px] pl-[3px] pr-2.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm",
        cfg.cls
      )}
    >
      <span className="flex h-[15px] w-[15px] items-center justify-center rounded-full bg-white/25">
        <cfg.Icon size={10} className="text-white" fill="currentColor" />
      </span>
      {cfg.label}
    </span>
  );
}

// Shimmering placeholders shown on the very first load (no rows yet).
function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"
        >
          <div className="skeleton h-44 w-full !rounded-none" />
          <div className="space-y-2 p-4">
            <div className="skeleton h-4 w-2/5" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton mt-3 h-6 w-1/3" />
            <div className="skeleton h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonList({ count = 10 }: { count?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-line/70 px-3 py-2.5 last:border-0"
        >
          <div className="skeleton h-11 w-11 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3.5 w-1/3" />
            <div className="skeleton h-3 w-2/3" />
          </div>
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

type ViewMode = "list" | "grid";

type SearchResp = {
  rows?: CatalogRow[];
  total?: number;
  shown?: number;
  totalPages?: number;
  pageSize?: number;
  discountDisplay?: string;
};

// Builds a windowed list of page numbers; -1 marks an ellipsis gap.
function buildPageList(current: number, total: number): number[] {
  if (total <= 1) return [1];
  const pages: number[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) pages.push(-1);
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push(-1);
  pages.push(total);
  return pages;
}

type Facets = {
  makes: string[];
  categories: string[];
  categoryTree: CatNode[];
  priceMin: number;
  priceMax: number;
};

function ProductImage({
  src,
  alt,
  size,
  onOpen,
}: {
  src: string | null;
  alt: string;
  size: "thumb" | "card";
  onOpen?: (proxied: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const proxied = src ? `/api/image?u=${encodeURIComponent(src)}` : null;

  if (!proxied || broken) {
    return (
      <div
        className={cx(
          "flex items-center justify-center rounded border border-line bg-gray-50 text-gray-300",
          size === "card" ? "h-full w-full" : "h-11 w-11"
        )}
      >
        <ImageOff size={size === "card" ? 30 : 16} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen?.(proxied)}
      title="Увеличить фото"
      className={cx(
        "group/img relative flex cursor-zoom-in items-center justify-center overflow-hidden rounded border border-line bg-white",
        size === "card" ? "h-full w-full" : "h-11 w-11"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied}
        alt={alt}
        loading="lazy"
        onError={() => setBroken(true)}
        className={cx(
          "object-contain transition-transform duration-200 group-hover/img:scale-105",
          size === "card" ? "max-h-full max-w-full" : "h-11 w-11"
        )}
      />
      {size === "card" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-200 group-hover/img:bg-black/10 group-hover/img:opacity-100">
          <ZoomIn size={22} className="text-white drop-shadow" />
        </span>
      )}
    </button>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        title="Закрыть"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X size={22} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-[92vw] rounded-lg bg-white object-contain shadow-2xl"
      />
    </div>
  );
}

export default function Catalog({
  role,
  hasNoAccess,
}: {
  role: Role;
  hasNoAccess: boolean;
}) {
  // Search query is shared with the global Header via the search store.
  const query = useSearch((s) => s.query);
  const setQuery = useSearch((s) => s.setQuery);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<{ name: string; count: number }[]>([]);
  const [category, setCategory] = useState("");
  const [categoryGroup, setCategoryGroup] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState(""); // "" | price_asc | price_desc
  const [discountDisplay, setDiscountDisplay] = useState("percent");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);

  const [view, setView] = useState<ViewMode>("grid");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [facets, setFacets] = useState<Facets | null>(null);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [shown, setShown] = useState(0);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  // Session-scoped cache of search responses (stale-while-revalidate +
  // next-page prefetch) — pagination and back-navigation feel instant.
  const resultsCacheRef = useRef<Map<string, SearchResp>>(new Map());
  const prevQueryRef = useRef(query);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cartItems = useCart((s) => s.items);
  const add = useCart((s) => s.add);
  const setCartQty = useCart((s) => s.setQty);
  const removeFromCart = useCart((s) => s.remove);
  // productId → qty currently in the cart (drives the persistent "В корзине" state).
  const cartQtyById = useMemo(
    () => new Map(cartItems.map((i) => [i.productId, i.qty])),
    [cartItems]
  );

  // Initialize filters from the URL (brand cards on the landing page link to
  // /catalog?make=…; the header may also pass ?q=…).
  const sp = useSearchParams();
  const urlMake = sp.get("make") ?? "";
  const urlCategory = sp.get("category") ?? "";
  const urlQ = sp.get("q") ?? "";
  useEffect(() => {
    if (urlMake) setMake(urlMake);
    if (urlCategory) {
      setCategory(urlCategory);
      setCategoryGroup("");
    }
    if (urlQ) setQuery(urlQ);
    if (urlMake || urlCategory || urlQ) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlMake, urlCategory, urlQ]);

  // Reset to the first page whenever the global search query changes.
  useEffect(() => {
    setPage(1);
  }, [query]);

  // Load facet values once.
  useEffect(() => {
    fetch("/api/products/filters")
      .then((r) => r.json())
      .then((d) => setFacets(d))
      .catch(() => {});
  }, []);

  // Load models for the selected make (dependent filter).
  useEffect(() => {
    if (!make) {
      setModels([]);
      return;
    }
    fetch(`/api/products/models?make=${encodeURIComponent(make)}`)
      .then((r) => r.json())
      .then((d) => setModels(d.models ?? []))
      .catch(() => setModels([]));
  }, [make]);

  // Load favorites (clients only).
  useEffect(() => {
    if (role !== "CLIENT") return;
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((d) => setFavorites(new Set<string>(d.ids ?? [])))
      .catch(() => {});
  }, [role]);

  function toggleFavorite(id: string) {
    setFavorites((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id }),
    }).catch(() => {});
  }

  // Admin: pin / badge a product card.
  function patchProduct(id: string, body: Partial<CatalogRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...body } : r)));
    fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  // Search whenever query, a filter, or the page changes.
  // Smoothness recipe: previous rows stay on screen while new ones load
  // (no blanking), responses are cached per param-set and re-applied
  // instantly (then silently revalidated), the next page is prefetched so
  // pagination feels immediate, and only typing is debounced — filter
  // clicks and page switches fire at once.
  useEffect(() => {
    const buildParams = (p: number) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (make) params.set("make", make);
      if (model) params.set("model", model);
      if (category) params.set("category", category);
      else if (categoryGroup) params.set("categoryGroup", categoryGroup);
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      if (inStock) params.set("inStock", "1");
      if (sort) params.set("sort", sort);
      params.set("page", String(p));
      return params.toString();
    };
    const cache = resultsCacheRef.current;
    const cacheSet = (k: string, v: SearchResp) => {
      cache.delete(k);
      cache.set(k, v);
      while (cache.size > 40) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    };
    const apply = (d: SearchResp) => {
      setRows(d.rows ?? []);
      setTotal(d.total ?? 0);
      setShown(d.shown ?? d.rows?.length ?? 0);
      setTotalPages(d.totalPages ?? 1);
      if (d.pageSize) setPageSize(d.pageSize);
      if (d.discountDisplay) setDiscountDisplay(d.discountDisplay);
    };

    const delay = query !== prevQueryRef.current ? 300 : 0;
    prevQueryRef.current = query;

    const key = buildParams(page);
    const hit = cache.get(key);
    if (hit) {
      // Instant paint from cache; the fetch below revalidates silently.
      apply(hit);
      setLoading(false);
    }

    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (!hit) setLoading(true);

      fetch(`/api/products/search?${key}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((d: SearchResp) => {
          cacheSet(key, d);
          apply(d);
          // Warm the next page in the background for instant pagination.
          const tp = d.totalPages ?? 1;
          if (page < tp) {
            const nextKey = buildParams(page + 1);
            if (!cache.has(nextKey)) {
              fetch(`/api/products/search?${nextKey}`, { signal: ac.signal })
                .then((r) => r.json())
                .then((nd: SearchResp) => cacheSet(nextKey, nd))
                .catch(() => {});
            }
          }
        })
        .catch((e) => {
          if (e.name !== "AbortError" && !hit) {
            setRows([]);
            setTotal(0);
            setShown(0);
            setTotalPages(1);
          }
        })
        .finally(() => setLoading(false));
    }, delay);
    return () => clearTimeout(t);
  }, [query, make, model, category, categoryGroup, minPrice, maxPrice, inStock, sort, page]);

  function handleAdd(row: CatalogRow) {
    add({
      productId: row.id,
      sku: row.sku,
      name: row.name,
      price: row.price,
      // Carry the discount into the cart so it stays visible there.
      oldPrice: row.oldPrice,
      discountPct: row.discountPct,
      imageUrl: row.imageUrl,
    });
  }

  function resetFilters() {
    setMake("");
    setModel("");
    setCategory("");
    setCategoryGroup("");
    setMinPrice("");
    setMaxPrice("");
    setInStock(false);
    setSort("");
    setPage(1);
  }

  function goToPage(p: number) {
    setPage(Math.min(Math.max(1, p), totalPages));
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const pageList = buildPageList(page, totalPages);
  const showActions = role === "CLIENT";
  const showAdminControls = role === "ADMIN";
  const hasFilters = !!(
    make ||
    model ||
    category ||
    categoryGroup ||
    minPrice ||
    maxPrice ||
    inStock ||
    sort
  );

  const empty = !loading && rows.length === 0;

  function StockBadges({ row }: { row: CatalogRow }) {
    if (row.stocks.length === 0) {
      return <span className="text-xs text-muted">нет на складах</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {row.stocks.map((s) => (
          <span
            key={s.warehouse}
            className={cx(
              "badge border",
              s.qty > 0
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-line bg-gray-50 text-muted"
            )}
            title={s.warehouse}
          >
            {s.warehouse}:&nbsp;<b>{formatNum(s.qty)}</b>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Slim header (the search lives in the global Header now) */}
      <div className="flex items-center justify-between gap-4 border-b border-line bg-white px-6 py-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-ink">Каталог запчастей</h1>
          <p className="truncate text-xs text-muted">
            {query ? (
              <>
                Поиск: «<span className="text-ink">{query}</span>» ·{" "}
              </>
            ) : null}
            Фильтры по марке, категории и цене
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-line bg-gray-50 p-0.5">
            <button
              onClick={() => setView("list")}
              title="Список"
              className={cx(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
                view === "list"
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              )}
            >
              <List size={14} />
              <span className="hidden sm:inline">Список</span>
            </button>
            <button
              onClick={() => setView("grid")}
              title="Сетка"
              className={cx(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
                view === "grid"
                  ? "bg-white text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              )}
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Сетка</span>
            </button>
          </div>

          <div className="text-xs text-muted">
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={12} className="animate-spin" /> поиск…
              </span>
            ) : (
              <>
                Найдено: <span className="font-semibold text-ink">{total}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {role === "CLIENT" && hasNoAccess && (
        <div className="flex items-center gap-2 border-b border-line bg-amber-50 px-6 py-2 text-xs text-amber-800">
          <TriangleAlert size={14} />
          Вам ещё не открыт доступ ни к одному складу — остатки скрыты. Обратитесь
          к вашему менеджеру.
        </div>
      )}

      {/* Filters + content */}
      <div className="flex min-h-0 flex-1">
        {/* Filter rail */}
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-line bg-white p-4 md:block">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
              <SlidersHorizontal size={15} /> Фильтры
            </span>
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                <X size={11} /> Сбросить
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Марка авто
              </label>
              <select
                value={make}
                onChange={(e) => {
                  setMake(e.target.value);
                  setModel("");
                  setPage(1);
                }}
                className="input"
              >
                <option value="">Все марки</option>
                {facets?.makes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {make && models.length > 0 && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Модель {make}
                </label>
                <select
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    setPage(1);
                  }}
                  className="input"
                >
                  <option value="">Все модели</option>
                  {models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.count})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Категория
              </label>
              <CategoryTree
                tree={facets?.categoryTree ?? []}
                category={category}
                categoryGroup={categoryGroup}
                onPickExact={(name) => {
                  setCategory(name);
                  setCategoryGroup("");
                  setPage(1);
                }}
                onPickGroup={(group) => {
                  setCategoryGroup(group);
                  setCategory("");
                  setPage(1);
                }}
                onClear={() => {
                  setCategory("");
                  setCategoryGroup("");
                  setPage(1);
                }}
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Цена, ₸
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={minPrice}
                  onChange={(e) => {
                    setMinPrice(e.target.value);
                    setPage(1);
                  }}
                  placeholder={facets ? String(facets.priceMin) : "от"}
                  className="input"
                />
                <span className="text-muted">—</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(e) => {
                    setMaxPrice(e.target.value);
                    setPage(1);
                  }}
                  placeholder={facets ? String(facets.priceMax) : "до"}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Сортировка
              </label>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="input"
              >
                <option value="">По умолчанию</option>
                <option value="price_asc">Цена: по возрастанию</option>
                <option value="price_desc">Цена: по убыванию</option>
              </select>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={inStock}
                onChange={(e) => {
                  setInStock(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 accent-accent"
              />
              Только в наличии
            </label>
          </div>
        </aside>

        {/* Table / grid + pagination */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Refreshing existing results: thin bar + slight dim, no blanking */}
          {loading && rows.length > 0 && <div className="loading-bar" />}
          <div
            ref={scrollRef}
            className={cx(
              "flex-1 overflow-auto p-4",
              loading && rows.length > 0 && "stale-fade"
            )}
          >
            {loading && rows.length === 0 ? (
              /* First load → shimmering skeletons instead of a spinner */
              view === "grid" ? (
                <SkeletonGrid />
              ) : (
                <SkeletonList />
              )
            ) : empty ? (
              <div className="rounded-lg border border-line bg-white py-16 text-center">
                <PackageSearch size={32} className="mx-auto mb-2 text-gray-300" />
                <div className="text-sm font-medium text-ink">
                  Ничего не найдено
                </div>
                <div className="text-xs text-muted">
                  Измените фильтры или синхронизируйте каталог с 1С.
                </div>
              </div>
            ) : view === "list" ? (
              /* ─── List (table) view ─────────────────────────────── */
              <div className="overflow-hidden rounded-lg border border-line bg-white">
                <table className="data-table">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="w-14">Фото</th>
                      <th className="w-40">Артикул</th>
                      <th className="w-36">Категория</th>
                      <th>Применяемость</th>
                      <th className="w-28 text-right">Цена</th>
                      <th className="w-60">Наличие</th>
                      {showActions && <th className="w-20"></th>}
                      {showAdminControls && (
                        <th className="w-48">Управление</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const qtyInCart = cartQtyById.get(row.id) ?? 0;
                      const inCart = qtyInCart > 0;
                      return (
                        <tr key={row.id}>
                          <td>
                            <ProductImage
                              src={row.imageUrl}
                              alt={row.sku}
                              size="thumb"
                              onOpen={(proxied) => {
                                setLightboxSrc(proxied);
                                trackView(row.id);
                              }}
                            />
                          </td>
                          <td>
                            <div className="font-semibold text-ink">
                              {row.sku}
                            </div>
                            <div className="text-[11px] text-muted">
                              код: {row.code}
                            </div>
                          </td>
                          <td>
                            {visibleCategory(row.category) ? (
                              <span
                                title={row.category ?? undefined}
                                className="font-medium text-ink"
                              >
                                {visibleCategory(row.category)}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            {role === "CLIENT" ? (
                              <div className="font-medium text-ink">
                                {row.fullName || row.sku}
                              </div>
                            ) : (
                              <>
                                <div className="font-medium text-ink">
                                  {row.name}
                                </div>
                                {row.fullName && (
                                  <div className="text-[11px] leading-snug text-muted">
                                    {row.fullName}
                                  </div>
                                )}
                              </>
                            )}
                            {row.badge && (
                              <div className="mt-1">
                                <BadgeLabel badge={row.badge} />
                              </div>
                            )}
                            {row.viaAnalog && (
                              <div className="mt-1 inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-dark">
                                <Replace size={10} /> Аналог:{" "}
                                {row.viaAnalog.brand || "—"} ({row.viaAnalog.code}
                                )
                              </div>
                            )}
                          </td>
                          <td className="text-right font-semibold text-ink">
                            {row.price > 0 ? (
                              <>
                                {row.discountPct > 0 &&
                                  row.oldPrice != null && (
                                    <div className="text-[10px] font-normal text-gray-400 line-through">
                                      {formatTenge(row.oldPrice)}
                                    </div>
                                  )}
                                <div className="flex items-center justify-end gap-1.5">
                                  {formatTenge(row.price)}
                                  {row.discountPct > 0 && (
                                    <span className="whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                      {formatDiscount(
                                        discountDisplay,
                                        row.discountPct,
                                        row.oldPrice,
                                        row.price
                                      )}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td>
                            <StockBadges row={row} />
                          </td>
                          {showActions && (
                            <td>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => toggleFavorite(row.id)}
                                  title="В избранное"
                                  className={cx(
                                    "flex h-8 w-8 items-center justify-center rounded border transition-colors",
                                    favorites.has(row.id)
                                      ? "border-accent/30 bg-accent/10 text-accent"
                                      : "border-line text-muted hover:text-accent"
                                  )}
                                >
                                  <Heart
                                    size={15}
                                    className={
                                      favorites.has(row.id) ? "fill-accent" : ""
                                    }
                                  />
                                </button>
                                <button
                                  onClick={() => handleAdd(row)}
                                  disabled={!inCart && row.totalQty === 0}
                                  title={
                                    inCart
                                      ? `В корзине: ${qtyInCart} шт — добавить ещё`
                                      : row.totalQty === 0
                                        ? "Нет в наличии — добавьте в избранное"
                                        : "В корзину"
                                  }
                                  className={cx(
                                    "relative flex h-8 w-8 items-center justify-center rounded transition-colors",
                                    inCart
                                      ? "bg-green-600 text-white"
                                      : row.totalQty === 0
                                        ? "cursor-not-allowed bg-gray-100 text-gray-300"
                                        : "bg-accent text-white hover:bg-accent-dark"
                                  )}
                                >
                                  {inCart ? (
                                    <>
                                      <Check size={16} />
                                      {qtyInCart > 1 && (
                                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ink px-1 text-[9px] font-bold text-white">
                                          {qtyInCart}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <Plus size={16} />
                                  )}
                                </button>
                              </div>
                            </td>
                          )}
                          {showAdminControls && (
                            <td>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() =>
                                    patchProduct(row.id, {
                                      pinned: !row.pinned,
                                    })
                                  }
                                  title={row.pinned ? "Открепить" : "Закрепить"}
                                  className={cx(
                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded border transition-colors",
                                    row.pinned
                                      ? "border-accent bg-accent text-white"
                                      : "border-line text-muted hover:text-accent"
                                  )}
                                >
                                  <Pin size={13} />
                                </button>
                                <select
                                  value={row.badge ?? ""}
                                  onChange={(e) =>
                                    patchProduct(row.id, {
                                      badge: (e.target.value ||
                                        null) as CatalogRow["badge"],
                                    })
                                  }
                                  className="input py-1 text-xs"
                                >
                                  <option value="">Без значка</option>
                                  <option value="NEW">Новинка</option>
                                  <option value="HIT">Хит продаж</option>
                                </select>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ─── Grid (cards) view ─────────────────────────────── */
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {rows.map((row, i) => {
                  const qtyInCart = cartQtyById.get(row.id) ?? 0;
                  const inCart = qtyInCart > 0;
                  const pct = row.discountPct;
                  const oldP = row.oldPrice;
                  const desc =
                    row.fullName || (role === "CLIENT" ? "" : row.name);
                  return (
                    <div
                      key={row.id}
                      style={{ animationDelay: `${Math.min(i, 11) * 25}ms` }}
                      className="animate-fade-in-up group relative flex flex-col rounded-xl border border-line bg-white shadow-sm transition-all duration-200 hover:z-10 hover:shadow-lg"
                    >
                      <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-t-xl border-b border-line bg-gray-50 p-3">
                        <ProductImage
                          src={row.imageUrl}
                          alt={row.sku}
                          size="card"
                          onOpen={(proxied) => {
                            setLightboxSrc(proxied);
                            trackView(row.id);
                          }}
                        />
                        {showActions && (
                          <button
                            onClick={() => toggleFavorite(row.id)}
                            title="В избранное"
                            className={cx(
                              "absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border bg-white/90 shadow-sm transition-colors",
                              favorites.has(row.id)
                                ? "border-accent/30 text-accent"
                                : "border-line text-muted hover:text-accent"
                            )}
                          >
                            <Heart
                              size={15}
                              className={
                                favorites.has(row.id) ? "fill-accent" : ""
                              }
                            />
                          </button>
                        )}
                        {row.badge && (
                          <span className="absolute bottom-2 left-2">
                            <BadgeLabel badge={row.badge} />
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="shrink-0 font-bold text-ink">
                            {row.sku}
                          </span>
                          {visibleCategory(row.category) && (
                            <span
                              title={row.category ?? undefined}
                              className="max-w-[55%] truncate rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-muted"
                            >
                              {visibleCategory(row.category)}
                            </span>
                          )}
                        </div>
                        {desc && (
                          <div className="group/desc relative mt-1">
                            <p className="line-clamp-2 cursor-help text-xs leading-snug text-muted">
                              {desc}
                            </p>
                            {desc.length > 60 && (
                              <div className="pointer-events-none absolute inset-x-0 top-full z-40 mt-1 hidden rounded-lg bg-ink/95 p-2.5 text-[11px] leading-relaxed text-white shadow-xl ring-1 ring-white/10 group-hover/desc:block">
                                {desc}
                              </div>
                            )}
                          </div>
                        )}
                        {row.viaAnalog && (
                          <div className="mt-1.5 inline-flex w-fit items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-dark">
                            <Replace size={10} /> Аналог:{" "}
                            {row.viaAnalog.brand || "—"}
                          </div>
                        )}

                        <div className="mt-2.5">
                          <StockBadges row={row} />
                        </div>

                        <div className="mt-auto pt-3">
                          {row.price > 0 ? (
                            <div className="mb-2.5">
                              {pct > 0 && oldP != null && (
                                <div className="mb-0.5 flex items-center gap-2">
                                  <span className="text-sm text-gray-400 line-through">
                                    {formatTenge(oldP)}
                                  </span>
                                  <span className="whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                    {formatDiscount(
                                      discountDisplay,
                                      pct,
                                      oldP,
                                      row.price
                                    )}
                                  </span>
                                </div>
                              )}
                              <div className="text-xl font-extrabold text-ink">
                                {formatTenge(row.price)}
                              </div>
                            </div>
                          ) : (
                            <div className="mb-2.5 text-sm font-semibold text-muted">
                              Цена по запросу
                            </div>
                          )}

                          {showActions &&
                            (inCart ? (
                              <CartQtySelector
                                qty={qtyInCart}
                                onSet={(n) => setCartQty(row.id, n)}
                                onRemove={() => removeFromCart(row.id)}
                              />
                            ) : row.totalQty === 0 ? (
                              <button
                                disabled
                                title="Нет на складах — добавьте в избранное, чтобы не потерять"
                                className="btn h-9 w-full cursor-not-allowed whitespace-nowrap bg-gray-100 text-muted"
                              >
                                Нет в наличии
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAdd(row)}
                                className="btn-accent h-9 w-full whitespace-nowrap transition-all duration-200"
                              >
                                <ShoppingCart size={16} /> В корзину
                              </button>
                            ))}
                          {showAdminControls && (
                            <div className="mt-3 flex items-center gap-2 border-t border-line pt-2">
                              <button
                                onClick={() =>
                                  patchProduct(row.id, { pinned: !row.pinned })
                                }
                                className={cx(
                                  "flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                                  row.pinned
                                    ? "border-accent bg-accent text-white"
                                    : "border-line text-muted hover:text-accent"
                                )}
                              >
                                <Pin size={12} />{" "}
                                {row.pinned ? "Закреплён" : "Закрепить"}
                              </button>
                              <select
                                value={row.badge ?? ""}
                                onChange={(e) =>
                                  patchProduct(row.id, {
                                    badge: (e.target.value ||
                                      null) as CatalogRow["badge"],
                                  })
                                }
                                className="input flex-1 py-1 text-xs"
                              >
                                <option value="">Без значка</option>
                                <option value="NEW">Новинка</option>
                                <option value="HIT">Хит продаж</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-4 py-2 text-xs">
              <span className="text-muted">
                Показано{" "}
                <span className="font-medium text-ink">
                  {total === 0 ? 0 : (page - 1) * pageSize + 1}–
                  {(page - 1) * pageSize + shown}
                </span>{" "}
                из <span className="font-medium text-ink">{total}</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="flex h-7 min-w-[28px] items-center justify-center rounded border border-line px-1.5 text-ink hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ChevronLeft size={15} />
                </button>
                {pageList.map((p, i) =>
                  p === -1 ? (
                    <span key={`gap${i}`} className="px-1 text-muted">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p)}
                      className={cx(
                        "h-7 min-w-[28px] rounded border px-1.5 text-xs font-medium",
                        p === page
                          ? "border-accent bg-accent text-white"
                          : "border-line text-ink hover:bg-gray-50"
                      )}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="flex h-7 min-w-[28px] items-center justify-center rounded border border-line px-1.5 text-ink hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
