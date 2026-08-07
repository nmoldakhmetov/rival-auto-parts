"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  PackageSearch,
  TriangleAlert,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Heart,
  Pin,
  Star,
  Flame,
  Gift,
  Maximize2,
} from "lucide-react";
import { useCart, cartKey, itemKey } from "@/store/cart";
import { useSearch } from "@/store/search";
import { formatTenge, formatDiscount } from "@/lib/format";
import { visibleCategory } from "@/lib/categories";
import { isPairOnly, snapPairQty, PAIR_STEP } from "@/lib/pair-only";
import { addSearchHistory } from "@/lib/search-history";
import AddToCartPanel from "@/components/AddToCartPanel";
import { canEditCatalog } from "@/lib/permissions";
import StockBadges from "@/components/StockBadges";
import ViewToggle, { type ViewMode } from "@/components/ViewToggle";
import EmptyState from "@/components/EmptyState";
import { toast } from "@/store/toast";
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

type SearchResp = {
  rows?: CatalogRow[];
  total?: number;
  shown?: number;
  totalPages?: number;
  pageSize?: number;
  discountDisplay?: string;
  warehouseTooltip?: string;
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

  // Нет фото (или ссылка битая) → фирменная заглушка вместо пустой иконки.
  if (!proxied || broken) {
    return (
      <div
        className={cx(
          "flex items-center justify-center overflow-hidden rounded border border-line bg-white",
          size === "card" ? "h-full w-full" : "h-11 w-11"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/no-photo.png"
          alt="Фото товара пока нет"
          loading="lazy"
          className="max-h-full max-w-full object-contain"
        />
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

// Обрезанный текст (применяемость) с всплывающей подсказкой на полный текст.
// Наведение — для мыши, нажатие — для телефона, где hover не существует.
// Подсказка position:fixed: в списке ячейка лежит внутри таблицы с
// overflow-x-auto, и absolute-подсказку там просто обрезало бы.
function ClampedText({
  text,
  lines,
  fill,
  className,
}: {
  text: string;
  // До 4 строк: у товара с несколькими складами строка списка выше, и
  // применяемости достаётся больше места.
  lines: 1 | 2 | 3 | 4;
  // fill — занять всю высоту родителя вместо фиксированного числа строк.
  // Нужно в карточках сетки: они тянутся под самую высокую в ряду, и текст
  // должен заполнять то, что осталось, а не обрываться на второй строке.
  fill?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  const open = () => {
    const el = ref.current;
    if (!el) return;
    // Показываем только если текст действительно не поместился.
    if (el.scrollHeight <= el.clientHeight + 1) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(320, Math.max(220, r.width));
    let left = r.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setPos({ top: r.bottom + 6, left, width });
  };
  const close = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    // Клик по самому тексту не всплывает (stopPropagation), поэтому эти
    // слушатели ловят только «нажатие мимо».
    const onAway = () => close();
    window.addEventListener("scroll", onAway, true);
    window.addEventListener("resize", onAway);
    document.addEventListener("touchstart", onAway);
    document.addEventListener("click", onAway);
    return () => {
      window.removeEventListener("scroll", onAway, true);
      window.removeEventListener("resize", onAway);
      document.removeEventListener("touchstart", onAway);
      document.removeEventListener("click", onAway);
    };
  }, [pos]);

  return (
    <>
      <p
        ref={ref}
        onMouseEnter={open}
        onMouseLeave={close}
        onClick={(e) => {
          e.stopPropagation();
          if (pos) close();
          else open();
        }}
        className={cx(
          "cursor-help",
          fill
            ? // absolute: текст НЕ участвует в расчёте высоты родителя,
              // иначе длинная применяемость сама растягивала бы карточку.
              // Он лишь заполняет то место, которое осталось.
              "absolute inset-0 overflow-hidden"
            : lines === 1
              ? "line-clamp-1"
              : lines === 2
                ? "line-clamp-2"
                : lines === 3
                  ? "line-clamp-3"
                  : "line-clamp-4",
          className
        )}
      >
        {text}
      </p>
      {pos && (
        <div
          className="pointer-events-none fixed z-[70] rounded-lg bg-ink/95 p-2.5 text-[11px] leading-relaxed text-white shadow-xl ring-1 ring-white/10"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {text}
        </div>
      )}
    </>
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
  broadcastId,
  promoOnly,
  heading,
  subheading,
}: {
  role: Role;
  hasNoAccess: boolean;
  // Optional broadcast scope: full catalog UX limited to one broadcast's
  // products (used by /broadcasts/[id], «как каталог»).
  broadcastId?: string;
  // «Акции»: only gift-trigger and discounted products, gifts pinned first.
  promoOnly?: boolean;
  heading?: string;
  subheading?: string;
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
  // Delivery-terms tooltip on warehouse pills (Setting `warehouse_tooltip`).
  const [whTooltip, setWhTooltip] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);

  // Сетка — вид по умолчанию везде. На ДЕСКТОПЕ поисковый запрос переключает
  // выдачу в список: артикулы так сканируются глазами быстрее, а места хватает.
  // На телефоне (в том числе в PWA с домашнего экрана) список пришлось бы
  // листать вбок, поэтому там остаётся сетка.
  //
  // Порог lg (1024px) — тот же, на котором приложение само переходит в
  // «десктопный» режим (боковое меню вместо шторки).
  const [view, setView] = useState<ViewMode>("grid");
  const viewQueryRef = useRef("");
  useEffect(() => {
    const q = query.trim();
    const had = viewQueryRef.current !== "";
    const has = q !== "";
    viewQueryRef.current = q;
    // Реагируем только на переход «пусто ↔ не пусто», иначе ручное
    // переключение вида посреди поиска сбрасывалось бы на каждой букве.
    if (has === had) return;
    const desktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;
    if (has) {
      if (desktop) setView("list");
    } else {
      setView("grid");
    }
  }, [query]);
  // Local per-card qty picks (grid view): the amount is chosen on the card
  // first — the displayed price multiplies live — and lands in the cart only
  // when «В корзину» is pressed (see AddToCartPanel).
  const [pickQty, setPickQty] = useState<Record<string, number>>({});
  const setPick = (id: string, n: number) =>
    // Same cap as the cart store / server (protects the order total).
    setPickQty((m) => ({ ...m, [id]: Math.min(100_000, Math.max(1, n)) }));
  // Mobile-only filters drawer (on md+ the filter rail is always visible).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Gift promos: rules (trigger→banner) + gift product cards (for the preview).
  const [giftRules, setGiftRules] = useState<
    { id: string; minQty: number; triggerIds: string[]; giftIds: string[] }[]
  >([]);
  const [giftProducts, setGiftProducts] = useState<Record<string, CatalogRow>>(
    {}
  );
  const [giftModal, setGiftModal] = useState<CatalogRow | null>(null);

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
  // productId → qty currently in the cart (drives the persistent "В корзине" state).
  // Ключ позиции (товар+склад) → количество в корзине. Один товар может
  // лежать в корзине дважды — с разных складов.
  const cartQtyByKey = useMemo(
    () => new Map(cartItems.map((i) => [itemKey(i), i.qty])),
    [cartItems]
  );

  // Предел количества для строки: остаток склада. Если остаток скрыт как
  // «>70» (capped), точного числа клиент не знает — предел не ставим, лишнее
  // отсечёт сервер при оформлении.
  const lineMax = (stock?: { qty: number; capped?: boolean } | null) =>
    stock && !stock.capped ? stock.qty : undefined;

  // Строки заказа для товара: по одной на каждый доступный склад с остатком.
  // Клиент заказывает СО СКЛАДА, поэтому у каждого своя цена, количество и
  // кнопка корзины, а в корзину ложатся отдельные позиции. Если остатка нет
  // нигде — одна строка без склада (кнопка будет неактивной).
  const warehouseLines = (row: CatalogRow) => {
    const inStock = row.stocks.filter((s) => s.qty > 0);
    if (inStock.length === 0) {
      return [{ key: cartKey(row.id, null), warehouse: null, stock: null }];
    }
    return inStock.map((s) => ({
      key: cartKey(row.id, s.warehouse),
      warehouse: s.warehouse,
      stock: s,
    }));
  };

  // Где вставить подпись «Аналоги»: сразу после блока точных совпадений.
  // Показываем её, только если найденный товар реально есть в выдаче и за
  // ним что-то следует — иначе подпись висела бы над пустотой.
  const showAnalogsDivider = useMemo(() => {
    if (!rows[0]?.exactMatch) return -1;
    const idx = rows.findIndex((r) => !r.exactMatch);
    return idx > 0 ? idx : -1;
  }, [rows]);

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

  // Load active gift promos once (trigger banners + gift card preview).
  useEffect(() => {
    fetch("/api/gifts")
      .then((r) => r.json())
      .then((d) => {
        setGiftRules(d.rules ?? []);
        setGiftProducts(d.giftProducts ?? {});
      })
      .catch(() => {});
  }, []);

  function toggleFavorite(id: string) {
    const adding = !favorites.has(id);
    setFavorites((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    toast.success(
      adding ? "Добавлено в избранное" : "Убрано из избранного"
    );
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
      if (broadcastId) params.set("broadcast", broadcastId);
      if (promoOnly) params.set("promo", "1");
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
      if (d.warehouseTooltip !== undefined) setWhTooltip(d.warehouseTooltip);
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
  }, [query, make, model, category, categoryGroup, minPrice, maxPrice, inStock, sort, broadcastId, promoOnly, page]);

  // Recent-searches history (Header dropdown): record once the query settles;
  // intermediate prefixes are collapsed inside addSearchHistory anyway.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => addSearchHistory(q), 1500);
    return () => clearTimeout(t);
  }, [query]);

  function handleAdd(
    row: CatalogRow,
    warehouse: string | null,
    qty?: number
  ) {
    const pair = isPairOnly(row.category);
    add(
      {
        productId: row.id,
        sku: row.sku,
        name: row.name,
        price: row.price,
        // Carry the discount into the cart so it stays visible there.
        oldPrice: row.oldPrice,
        discountPct: row.discountPct,
        imageUrl: row.imageUrl,
        pairOnly: pair,
        // Склад выбирается здесь, в каталоге: у товара с остатком на
        // нескольких складах своя кнопка на каждый склад, и в корзину
        // ложатся отдельные строки.
        warehouse,
      },
      qty ?? (pair ? PAIR_STEP : 1)
    );
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

  // Один и тот же переключатель страниц над списком и под ним.
  function Pager({ position }: { position: "top" | "bottom" }) {
    return (
      <div
        className={cx(
          "flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-2 text-xs",
          position === "top" ? "border-b border-line" : "border-t border-line"
        )}
      >
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
            title="Предыдущая страница"
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
            title="Следующая страница"
            className="flex h-7 min-w-[28px] items-center justify-center rounded border border-line px-1.5 text-ink hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    );
  }
  const showActions = role === "CLIENT";
  const showAdminControls = canEditCatalog(role);
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

  // ─── Gift promos ──────────────────────────────────────────────────────────
  const giftRulesFor = (productId: string) =>
    giftRules.filter((r) => r.triggerIds.includes(productId));

  const openGift = (giftId: string) => {
    const gp = giftProducts[giftId];
    if (gp) setGiftModal(gp);
  };

  // Green "купи N → получи X в подарок" banner shown on trigger product cards.
  // Each gift sku opens the gift product's card (grid form) on hover/click.
  function GiftBanner({ row, compact }: { row: CatalogRow; compact?: boolean }) {
    const matched = giftRulesFor(row.id);
    if (matched.length === 0) return null;
    return (
      <div className={cx("space-y-1", compact ? "mt-1.5" : "mt-2.5")}>
        {matched.map((r) => (
          <div
            key={r.id}
            className={cx(
              "flex flex-wrap items-center gap-x-1 rounded-lg border border-green-200 bg-green-50 leading-tight text-green-800",
              compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px]"
            )}
          >
            <Gift
              size={compact ? 12 : 14}
              className="mr-0.5 shrink-0 text-green-600"
            />
            <span>
              При покупке от <b>{r.minQty} шт</b> —{" "}
            </span>
            {r.giftIds.map((gid, idx) => {
              const gp = giftProducts[gid];
              if (!gp) return null;
              return (
                <span key={gid}>
                  <button
                    onClick={() => openGift(gid)}
                    title="Открыть карточку подарка"
                    className="inline-flex items-center gap-0.5 font-bold underline decoration-dotted underline-offset-2 hover:text-green-900"
                  >
                    {gp.sku}
                    <Maximize2 size={compact ? 9 : 10} className="opacity-70" />
                  </button>
                  {idx < r.giftIds.length - 1 ? ", " : ""}
                </span>
              );
            })}
            <span>&nbsp;в подарок!</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Slim header (the search lives in the global Header now) */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-white px-4 py-3 sm:gap-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-ink">
            {heading ?? "Каталог запчастей"}
          </h1>
          <p className="truncate text-xs text-muted">
            {query ? (
              <>
                Поиск: «<span className="text-ink">{query}</span>» ·{" "}
              </>
            ) : null}
            {subheading ?? "Фильтры по марке, категории и цене"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Mobile filters trigger */}
          <button
            onClick={() => setFiltersOpen(true)}
            className={cx(
              "relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 md:hidden",
              hasFilters
                ? "border-accent/40 bg-accent/5 text-accent"
                : "border-line text-muted hover:text-ink"
            )}
          >
            <SlidersHorizontal size={14} />
            <span>Фильтры</span>
            {hasFilters && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent" />
            )}
          </button>

          <ViewToggle view={view} onChange={setView} />

          <div className="hidden text-xs text-muted sm:block">
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
        {/* Mobile filters backdrop */}
        {filtersOpen && (
          <div
            onClick={() => setFiltersOpen(false)}
            className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm md:hidden"
            aria-hidden
          />
        )}
        {/* Filter rail: drawer on mobile, static column on md+ */}
        <aside
          className={cx(
            "fixed inset-y-0 left-0 z-[110] w-72 overflow-y-auto border-r border-line bg-white p-4 transition-transform duration-200",
            filtersOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
            "md:static md:z-auto md:w-60 md:shrink-0 md:translate-x-0 md:shadow-none md:transition-none"
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
              <SlidersHorizontal size={15} /> Фильтры
            </span>
            <span className="flex items-center gap-2">
              {hasFilters && (
                <button
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                >
                  <X size={11} /> Сбросить
                </button>
              )}
              <button
                onClick={() => setFiltersOpen(false)}
                title="Закрыть фильтры"
                className="flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-gray-100 hover:text-ink md:hidden"
              >
                <X size={15} />
              </button>
            </span>
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
          {/* Пагинация сверху тоже: на телефоне до нижней пришлось бы
              пролистать все 50 карточек, и казалось, что страниц нет вовсе. */}
          {total > 0 && !loading && <Pager position="top" />}
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
              <EmptyState
                Icon={PackageSearch}
                title="Ничего не найдено"
                hint={
                  query
                    ? `По запросу «${query}» ничего нет — проверьте артикул или попробуйте другое слово.`
                    : "Попробуйте изменить фильтры — или загляните в полный каталог."
                }
              >
                {(hasFilters || query) && (
                  <button
                    onClick={() => {
                      setQuery("");
                      resetFilters();
                    }}
                    className="btn-accent"
                  >
                    <X size={15} /> Сбросить фильтры
                  </button>
                )}
              </EmptyState>
            ) : view === "list" ? (
              /* ─── List (table) view (scrolls horizontally on phones) ── */
              <div className="overflow-x-auto rounded-lg border border-gray-300 bg-white">
                {/* На телефоне таблица уже: категория скрыта, кнопка в
                    действиях без подписи — иначе вправо ехать слишком долго. */}
                <table className="data-table min-w-[680px] sm:min-w-[1040px]">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="w-14">Фото</th>
                      <th className="w-32 sm:w-40">Артикул</th>
                      <th className="hidden w-36 sm:table-cell">Категория</th>
                      <th>Применяемость</th>
                      {/* Колонка была на 240px при плашках в ~130px, и между
                          наличием и ценой зияла пустая полоса. Освободившееся
                          уходит применяемости — ей места всегда мало. */}
                      <th className="w-36 sm:w-44">Наличие</th>
                      <th className="w-24 text-right sm:w-28">Цена</th>
                      {showActions && <th className="w-44 sm:w-72"></th>}
                      {showAdminControls && (
                        <th className="w-48">Управление</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIdx) => {
                      // «Диски UIDNU»: строго парами — шаг и минимум 2 шт.
                      const pair = isPairOnly(row.category);
                      const step = pair ? PAIR_STEP : 1;
                      // Заказ идёт СО СКЛАДА: у товара с остатком на
                      // нескольких доступных складах — свой блок «цена +
                      // количество + корзина» на каждый склад. Нет остатка
                      // нигде — одна строка без склада.
                      const lines = warehouseLines(row);
                      return (
                        <Fragment key={row.id}>
                        {/* Найденный товар идёт первым, всё остальное — это
                            аналоги и совпадения по тексту; отделяем их явной
                            подписью, чтобы не путать с самим артикулом. */}
                        {showAnalogsDivider === rowIdx && (
                          <tr>
                            <td
                              colSpan={
                                6 + (showActions ? 1 : 0) + (showAdminControls ? 1 : 0)
                              }
                              className="!py-1.5 !px-3 bg-gray-50 text-[11px] font-semibold uppercase tracking-wide text-muted"
                            >
                              Аналоги
                            </td>
                          </tr>
                        )}
                        <tr
                          // Высота больше не фиксируется: у товара может быть
                          // несколько складов, и строка растёт под них — заодно
                          // применяемости достаётся больше места.
                          className={cx(
                            row.exactMatch &&
                              "bg-accent/5 shadow-[inset_3px_0_0_0_#E53935]"
                          )}
                        >
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
                            {/* Внутренний код 1С — только для персонала. */}
                            {role !== "CLIENT" && (
                              <div className="text-[11px] text-muted">
                                код: {row.code}
                              </div>
                            )}
                          </td>
                          <td className="hidden sm:table-cell">
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
                          {/* Применяемости дано больше строк: раньше её
                              резало до двух ради ровной высоты списка, а
                              высота всё равно теперь зависит от числа
                              складов. Полный текст — в подсказке. */}
                          <td className="align-top">
                            {role === "CLIENT" ? (
                              <ClampedText
                                text={row.fullName || row.sku}
                                lines={
                                  Math.min(4, Math.max(2, lines.length + 1)) as
                                    | 2
                                    | 3
                                    | 4
                                }
                                className="font-medium text-ink"
                              />
                            ) : (
                              <>
                                <ClampedText
                                  text={row.name}
                                  lines={1}
                                  className="font-medium text-ink"
                                />
                                {row.fullName && (
                                  <ClampedText
                                    text={row.fullName}
                                    lines={
                                  Math.min(4, Math.max(2, lines.length + 1)) as
                                    | 2
                                    | 3
                                    | 4
                                }
                                    className="text-[11px] leading-snug text-muted"
                                  />
                                )}
                              </>
                            )}
                            {row.badge && (
                              <div className="mt-1">
                                <BadgeLabel badge={row.badge} />
                              </div>
                            )}
                            <GiftBanner row={row} compact />
                          </td>
                          {/* Наличие / цена / заказ — по строке на склад.
                              Блоки одинаковой высоты, поэтому три колонки
                              читаются как одна таблица внутри строки. */}
                          <td className="align-top">
                            <div className="flex flex-col gap-1.5">
                              {lines.map((ln) => (
                                <div
                                  key={ln.key}
                                  className="flex min-h-[38px] items-center"
                                >
                                  {ln.stock ? (
                                    <StockBadges
                                      stocks={[ln.stock]}
                                      tooltip={whTooltip}
                                    />
                                  ) : (
                                    <span className="text-[11px] text-muted">
                                      нет на складах
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="align-top text-right font-semibold text-ink">
                            <div className="flex flex-col gap-1.5">
                              {lines.map((ln) => {
                                const q = pickQty[ln.key] ?? step;
                                return (
                                  <div
                                    key={ln.key}
                                    className="flex min-h-[38px] flex-col justify-center"
                                  >
                                    {row.price > 0 ? (
                                      <>
                                        {row.discountPct > 0 &&
                                          row.oldPrice != null && (
                                            <div className="text-xs font-medium text-gray-400 line-through">
                                              {formatTenge(row.oldPrice * q)}
                                            </div>
                                          )}
                                        <div className="flex items-center justify-end gap-1.5">
                                          {formatTenge(row.price * q)}
                                          {row.discountPct > 0 && (
                                            <span className="whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                              {formatDiscount(
                                                discountDisplay,
                                                row.discountPct,
                                                row.oldPrice != null
                                                  ? row.oldPrice * q
                                                  : row.oldPrice,
                                                row.price * q
                                              )}
                                            </span>
                                          )}
                                        </div>
                                        {pair ? (
                                          <div className="text-[10px] font-semibold text-muted">
                                            цена за {q}шт
                                          </div>
                                        ) : q > 1 ? (
                                          <div className="text-[10px] font-semibold text-muted">
                                            за {q} шт
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      "—"
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          {showActions && (
                            <td className="align-top">
                              <div className="flex items-start gap-1">
                                <button
                                  onClick={() => toggleFavorite(row.id)}
                                  title="В избранное"
                                  className={cx(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded border transition-colors",
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
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                  {lines.map((ln) => (
                                    <div
                                      key={ln.key}
                                      className="flex min-h-[38px] items-center"
                                    >
                                      <AddToCartPanel
                                        qty={pickQty[ln.key] ?? step}
                                        step={step}
                                        layout="row"
                                        outOfStock={!ln.stock}
                                        inCartQty={cartQtyByKey.get(ln.key) ?? 0}
                                        max={lineMax(ln.stock)}
                                        onQtyChange={(n) =>
                                          setPick(
                                            ln.key,
                                            pair ? snapPairQty(n) : Math.max(1, n)
                                          )
                                        }
                                        onAdd={(n) =>
                                          handleAdd(row, ln.warehouse, n)
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
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
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ─── Grid (cards) view ─────────────────────────────── */
              // На телефоне 2 колонки: одна давала карточки во весь экран, и
              // за раз было видно от силы полторы позиции.
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {rows.map((row, i) => {
                  const pct = row.discountPct;
                  const oldP = row.oldPrice;
                  // «Диски UIDNU»: строго парами — шаг и минимум 2 шт.
                  const pair = isPairOnly(row.category);
                  const step = pair ? PAIR_STEP : 1;
                  // По блоку заказа на каждый доступный склад.
                  const lines = warehouseLines(row);
                  const desc =
                    row.fullName || (role === "CLIENT" ? "" : row.name);
                  return (
                    <Fragment key={row.id}>
                    {/* Разделитель на всю ширину сетки: выше — найденный
                        товар, ниже — аналоги и прочие совпадения. */}
                    {showAnalogsDivider === i && (
                      <div className="col-span-full -mb-1 mt-1 flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Аналоги
                        </span>
                        <span className="h-px flex-1 bg-line" />
                      </div>
                    )}
                    <div
                      style={{ animationDelay: `${Math.min(i, 11) * 25}ms` }}
                      className={cx(
                        // border-gray-300 вместо бледного border-line: на
                        // белом фоне контур карточек почти не читался, и
                        // сетка выглядела сплошным полотном.
                        "animate-fade-in-up group relative flex flex-col rounded-xl border transition-all duration-200 hover:z-10 hover:shadow-lg",
                        // Точное совпадение — как в списке: красная заливка
                        // bg-accent/5 плюс выраженная красная рамка.
                        row.exactMatch
                          ? "border-accent bg-accent/5 shadow-md ring-2 ring-accent/25"
                          : "border-gray-300 bg-white shadow-sm hover:border-gray-400"
                      )}
                    >
                      <div className="relative flex h-28 items-center justify-center overflow-hidden rounded-t-xl border-b border-line bg-gray-50 p-2 sm:h-44 sm:p-3">
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

                      <div className="flex flex-1 flex-col p-2.5 sm:p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span
                            title={row.sku}
                            className="min-w-0 truncate text-sm font-bold text-ink sm:text-base"
                          >
                            {row.sku}
                          </span>
                          {/* Категория на телефоне только мешает — места нет. */}
                          {visibleCategory(row.category) && (
                            <span
                              title={row.category ?? undefined}
                              className="hidden max-w-[55%] truncate rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:inline"
                            >
                              {visibleCategory(row.category)}
                            </span>
                          )}
                        </div>
                        {desc && (
                          // Применяемость занимает всё свободное место
                          // карточки: в ряду карточки тянутся под самую
                          // высокую (у товара с двумя складами), и у соседей
                          // с одним складом посередине зияла пустота. Теперь
                          // текст показывает столько строк, сколько влезло.
                          <div className="relative mt-1 min-h-[2.2rem] flex-1 overflow-hidden">
                            <ClampedText
                              text={desc}
                              fill
                              lines={2}
                              className="text-[10px] leading-snug text-muted sm:text-xs"
                            />
                          </div>
                        )}
                        <GiftBanner row={row} />

                        {/* Блок заказа — по одному на склад. Каждый склад
                            получает свою цену, количество и кнопку: заказ
                            идёт СО СКЛАДА, и в корзину ложатся отдельные
                            позиции. Один склад — привычный вид без лишней
                            обвязки, несколько — карточки складов. */}
                        <div className="mt-auto pt-2 sm:pt-3">
                          {lines.map((ln, lnIdx) => {
                            const q = pickQty[ln.key] ?? step;
                            return (
                              <div
                                key={ln.key}
                                className={cx(
                                  lines.length > 1 &&
                                    "rounded-lg border border-gray-300 p-2 sm:p-2.5",
                                  lines.length > 1 && lnIdx > 0 && "mt-2"
                                )}
                              >
                                <div className="mb-1.5">
                                  {ln.stock ? (
                                    <StockBadges
                                      stocks={[ln.stock]}
                                      tooltip={whTooltip}
                                    />
                                  ) : (
                                    <span className="text-[11px] text-muted">
                                      нет на складах
                                    </span>
                                  )}
                                </div>
                                {row.price > 0 ? (
                                  <div className="mb-2 sm:mb-2.5">
                                    {pct > 0 && oldP != null && (
                                      <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="text-xs font-medium text-gray-400 line-through sm:text-sm">
                                          {formatTenge(oldP * q)}
                                        </span>
                                        <span className="whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                          {formatDiscount(
                                            discountDisplay,
                                            pct,
                                            oldP * q,
                                            row.price * q
                                          )}
                                        </span>
                                      </div>
                                    )}
                                    <div
                                      className={cx(
                                        "font-extrabold text-ink",
                                        lines.length > 1
                                          ? "text-sm sm:text-lg"
                                          : "text-base sm:text-xl"
                                      )}
                                    >
                                      {formatTenge(row.price * q)}
                                      {pair ? (
                                        <span className="ml-1 text-[10px] font-semibold text-muted sm:ml-1.5 sm:text-xs">
                                          цена за {q}шт
                                        </span>
                                      ) : q > 1 ? (
                                        <span className="ml-1 text-[10px] font-semibold text-muted sm:ml-1.5 sm:text-xs">
                                          за {q} шт
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mb-2 text-xs font-semibold text-muted sm:mb-2.5 sm:text-sm">
                                    Цена по запросу
                                  </div>
                                )}

                                {showActions && (
                                  <AddToCartPanel
                                    qty={q}
                                    step={step}
                                    outOfStock={!ln.stock}
                                    inCartQty={cartQtyByKey.get(ln.key) ?? 0}
                                    max={lineMax(ln.stock)}
                                    onQtyChange={(n) =>
                                      setPick(
                                        ln.key,
                                        pair ? snapPairQty(n) : Math.max(1, n)
                                      )
                                    }
                                    onAdd={(n) => handleAdd(row, ln.warehouse, n)}
                                  />
                                )}
                              </div>
                            );
                          })}
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
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {total > 0 && <Pager position="bottom" />}
        </div>
      </div>

      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* Gift product card — centered popup, opened by clicking a gift sku in
          the promo banner. Works the same in list or grid view. */}
      {giftModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 animate-fade-in"
          onClick={() => setGiftModal(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setGiftModal(null)}
              title="Закрыть"
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-muted shadow hover:text-ink"
            >
              <X size={18} />
            </button>
            <div className="relative flex h-56 items-center justify-center border-b border-line bg-gray-50 p-4">
              <ProductImage
                src={giftModal.imageUrl}
                alt={giftModal.sku}
                size="card"
                onOpen={(proxied) => setLightboxSrc(proxied)}
              />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-bold text-white">
                <Gift size={12} /> Подарок
              </span>
              {giftModal.badge && (
                <span className="absolute bottom-3 left-3">
                  <BadgeLabel badge={giftModal.badge} />
                </span>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-lg font-bold text-ink">
                  {giftModal.sku}
                </span>
                {visibleCategory(giftModal.category) && (
                  <span
                    title={giftModal.category ?? undefined}
                    className="max-w-[55%] truncate rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-muted"
                  >
                    {visibleCategory(giftModal.category)}
                  </span>
                )}
              </div>
              {giftModal.fullName && (
                <p className="mt-1.5 text-sm leading-snug text-muted">
                  {giftModal.fullName}
                </p>
              )}
              <div className="mt-3">
                <StockBadges stocks={giftModal.stocks} tooltip={whTooltip} />
              </div>
              {giftModal.price > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  {giftModal.discountPct > 0 && giftModal.oldPrice != null && (
                    <span className="text-base font-medium text-gray-400 line-through">
                      {formatTenge(giftModal.oldPrice)}
                    </span>
                  )}
                  <span className="text-xl font-extrabold text-ink">
                    {formatTenge(giftModal.price)}
                  </span>
                </div>
              )}
              <div className="mt-4 flex items-start gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                <Gift size={14} className="mt-0.5 shrink-0 text-green-600" />
                <span>
                  Добавляется в заказ бесплатно при выполнении условия акции.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
