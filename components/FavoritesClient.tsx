"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, ShoppingCart, ImageOff } from "lucide-react";
import { useCart } from "@/store/cart";
import { formatTenge, formatDiscount } from "@/lib/format";
import { visibleCategory } from "@/lib/categories";
import { isPairOnly, PAIR_STEP } from "@/lib/pair-only";
import type { CatalogRow } from "@/lib/types";
import CartQtySelector from "@/components/CartQtySelector";
import StockBadges from "@/components/StockBadges";
import ViewToggle, { type ViewMode } from "@/components/ViewToggle";
import EmptyState from "@/components/EmptyState";
import { toast } from "@/store/toast";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded border border-line bg-gray-50">
        <ImageOff size={16} className="text-gray-300" />
      </div>
    );
  }
  return (
    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded border border-line bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/image?u=${encodeURIComponent(src)}`}
        alt={alt}
        loading="lazy"
        onError={() => setBroken(true)}
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

// The client's saved products with the same list/grid toggle as the catalog:
// live pricing, per-warehouse stock, cart qty controls. The heart removes an
// item from the list.
export default function FavoritesClient() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [discountDisplay, setDiscountDisplay] = useState("percent");
  const [whTooltip, setWhTooltip] = useState("");
  // List view is the default, mirroring the catalog.
  const [view, setView] = useState<ViewMode>("list");

  const cartItems = useCart((s) => s.items);
  const add = useCart((s) => s.add);
  const setCartQty = useCart((s) => s.setQty);
  const removeFromCart = useCart((s) => s.remove);
  const cartQtyById = useMemo(
    () => new Map(cartItems.map((i) => [i.productId, i.qty])),
    [cartItems]
  );

  useEffect(() => {
    fetch("/api/favorites?full=1")
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        if (d.discountDisplay) setDiscountDisplay(d.discountDisplay);
        if (d.warehouseTooltip) setWhTooltip(d.warehouseTooltip);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function removeFavorite(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
    toast.success("Убрано из избранного");
    fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id }),
    }).catch(() => {});
  }

  function addToCart(row: CatalogRow) {
    const pair = isPairOnly(row.category);
    add(
      {
        productId: row.id,
        sku: row.sku,
        name: row.name,
        price: row.price,
        oldPrice: row.oldPrice,
        discountPct: row.discountPct,
        imageUrl: row.imageUrl,
        pairOnly: pair,
      },
      pair ? PAIR_STEP : 1
    );
  }

  // Price block (strike + 1С badge + final), shared by both views. `mult`
  // doubles the displayed price for pair-only goods («Диски UIDNU»).
  function PriceBlock({ row, compact }: { row: CatalogRow; compact?: boolean }) {
    const mult = isPairOnly(row.category) ? 2 : 1;
    if (row.price <= 0) {
      return (
        <span className={cx("font-semibold text-muted", compact ? "text-xs" : "text-sm")}>
          {compact ? "—" : "Цена по запросу"}
        </span>
      );
    }
    return (
      <div className={compact ? "text-right" : undefined}>
        {row.discountPct > 0 && row.oldPrice != null && (
          <div
            className={cx(
              "flex items-center gap-2",
              compact ? "justify-end" : "mb-0.5"
            )}
          >
            <span
              className={cx(
                "text-gray-400 line-through",
                compact ? "text-[10px]" : "text-sm"
              )}
            >
              {formatTenge(row.oldPrice * mult)}
            </span>
            <span className="whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {formatDiscount(
                discountDisplay,
                row.discountPct,
                row.oldPrice * mult,
                row.price * mult
              )}
            </span>
          </div>
        )}
        <div
          className={cx(
            "font-extrabold text-ink",
            compact ? "text-sm" : "text-xl"
          )}
        >
          {formatTenge(row.price * mult)}
          {mult === 2 && (
            <span className="ml-1 text-[10px] font-semibold text-muted">
              за 2 шт
            </span>
          )}
        </div>
      </div>
    );
  }

  // Cart control (qty selector / add / out-of-stock), shared by both views.
  function CartControl({ row }: { row: CatalogRow }) {
    const qtyInCart = cartQtyById.get(row.id) ?? 0;
    const pair = isPairOnly(row.category);
    if (qtyInCart > 0) {
      return (
        <CartQtySelector
          qty={qtyInCart}
          step={pair ? PAIR_STEP : 1}
          onSet={(n) => setCartQty(row.id, n)}
          onRemove={() => removeFromCart(row.id)}
        />
      );
    }
    if (row.totalQty === 0) {
      return (
        <button
          disabled
          title="Нет на складах"
          className="btn h-9 w-full cursor-not-allowed whitespace-nowrap bg-gray-100 text-muted"
        >
          Нет в наличии
        </button>
      );
    }
    return (
      <button
        onClick={() => addToCart(row)}
        className="btn-accent h-9 w-full whitespace-nowrap transition-all duration-200"
      >
        <ShoppingCart size={16} /> В корзину
      </button>
    );
  }

  if (loading) {
    // Row-shaped skeleton matching the default list view.
    return (
      <div className="px-6 py-6">
        <div className="skeleton mb-4 h-7 w-48" />
        <div className="overflow-hidden rounded-lg border border-line bg-white p-4">
          <div className="skeleton mb-4 h-4 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-t border-line py-3"
            >
              <div className="skeleton h-11 w-11 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="skeleton h-4 w-1/4" />
                <div className="skeleton h-3 w-3/5" />
              </div>
              <div className="skeleton h-5 w-24" />
              <div className="skeleton h-4 w-16" />
              <div className="skeleton h-9 w-40" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <EmptyState
          Icon={Heart}
          title="В избранном пока пусто"
          hint="Нажимайте на сердечко у товара в каталоге, чтобы сохранить его здесь и быстро вернуться к нему позже."
        >
          <Link href="/catalog" className="btn-accent">
            Перейти в каталог
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-xl font-bold text-ink">
          <Heart size={20} className="text-accent" /> Избранное{" "}
          <span className="text-sm font-normal text-muted">
            · {rows.length} поз.
          </span>
        </h1>
        {/* View toggle — same control as the catalog */}
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "list" ? (
        /* ─── List (table) view (scrolls horizontally on phones) ──────── */
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="data-table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-14">Фото</th>
                <th className="w-40">Артикул</th>
                <th className="w-36">Категория</th>
                <th>Применяемость</th>
                <th className="w-60">Наличие</th>
                <th className="w-32 text-right">Цена</th>
                <th className="w-44"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <ProductThumb src={row.imageUrl} alt={row.sku} />
                  </td>
                  <td>
                    <div className="font-semibold text-ink">{row.sku}</div>
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
                    <div className="font-medium text-ink">
                      {row.fullName || row.sku}
                    </div>
                  </td>
                  <td>
                    <StockBadges stocks={row.stocks} tooltip={whTooltip} />
                  </td>
                  <td className="text-right font-semibold text-ink">
                    <PriceBlock row={row} compact />
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => removeFavorite(row.id)}
                        title="Убрать из избранного"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-accent/30 bg-accent/10 text-accent transition-colors hover:bg-accent hover:text-white"
                      >
                        <Heart size={15} className="fill-current" />
                      </button>
                      <div className="w-32">
                        <CartControl row={row} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ─── Grid (cards) view ───────────────────────────────────────── */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {rows.map((row, i) => {
            const desc = row.fullName || "";
            return (
              <div
                key={row.id}
                style={{ animationDelay: `${Math.min(i, 11) * 25}ms` }}
                className="animate-fade-in-up group relative flex flex-col rounded-xl border border-line bg-white shadow-sm transition-all duration-200 hover:z-10 hover:shadow-lg"
              >
                <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-t-xl border-b border-line bg-gray-50 p-3">
                  {row.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/image?u=${encodeURIComponent(row.imageUrl)}`}
                      alt={row.sku}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <ImageOff size={30} className="text-gray-300" />
                  )}
                  <button
                    onClick={() => removeFavorite(row.id)}
                    title="Убрать из избранного"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-white/90 text-accent shadow-sm transition-colors hover:bg-accent hover:text-white"
                  >
                    <Heart size={15} className="fill-current" />
                  </button>
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
                    <p
                      title={desc}
                      className="mt-1 line-clamp-2 text-xs leading-snug text-muted"
                    >
                      {desc}
                    </p>
                  )}

                  <div className="mt-2.5">
                    <StockBadges stocks={row.stocks} tooltip={whTooltip} />
                  </div>

                  <div className="mt-auto pt-3">
                    <div className="mb-2.5">
                      <PriceBlock row={row} />
                    </div>
                    <CartControl row={row} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
