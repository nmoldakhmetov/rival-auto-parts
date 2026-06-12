"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, ShoppingCart, ImageOff } from "lucide-react";
import { useCart } from "@/store/cart";
import { formatTenge, formatDiscount } from "@/lib/format";
import { visibleCategory } from "@/lib/categories";
import type { CatalogRow } from "@/lib/types";
import CartQtySelector from "@/components/CartQtySelector";
import { toast } from "@/store/toast";

// The client's saved products, rendered as catalog-style cards with live
// pricing and per-warehouse stock. The heart removes an item from the list.
export default function FavoritesClient() {
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [discountDisplay, setDiscountDisplay] = useState("percent");

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
    add({
      productId: row.id,
      sku: row.sku,
      name: row.name,
      price: row.price,
      oldPrice: row.oldPrice,
      discountPct: row.discountPct,
      imageUrl: row.imageUrl,
    });
  }

  if (loading) {
    return (
      <div className="px-6 py-6">
        <div className="skeleton mb-4 h-7 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"
            >
              <div className="skeleton h-44 w-full !rounded-none" />
              <div className="space-y-2 p-4">
                <div className="skeleton h-4 w-2/5" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton mt-3 h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <Heart size={40} className="mx-auto mb-3 text-gray-300" />
        <h1 className="text-lg font-bold text-ink">В избранном пока пусто</h1>
        <p className="mb-5 text-sm text-muted">
          Нажимайте на сердечко у товара в каталоге, чтобы сохранить его здесь.
        </p>
        <Link href="/catalog" className="btn-accent">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold text-ink">
        <Heart size={20} className="text-accent" /> Избранное{" "}
        <span className="text-sm font-normal text-muted">
          · {rows.length} поз.
        </span>
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {rows.map((row, i) => {
          const qtyInCart = cartQtyById.get(row.id) ?? 0;
          const inCart = qtyInCart > 0;
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
                  <span className="shrink-0 font-bold text-ink">{row.sku}</span>
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
                  {row.stocks.length === 0 ? (
                    <span className="text-xs text-muted">нет на складах</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {row.stocks.map((s) => (
                        <span
                          key={s.warehouse}
                          className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] text-green-800"
                        >
                          {s.warehouse}: <b>{s.qty}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-3">
                  {row.price > 0 ? (
                    <div className="mb-2.5">
                      {row.discountPct > 0 && row.oldPrice != null && (
                        <div className="mb-0.5 flex items-center gap-2">
                          <span className="text-sm text-gray-400 line-through">
                            {formatTenge(row.oldPrice)}
                          </span>
                          <span className="whitespace-nowrap rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {formatDiscount(
                              discountDisplay,
                              row.discountPct,
                              row.oldPrice,
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

                  {inCart ? (
                    <CartQtySelector
                      qty={qtyInCart}
                      onSet={(n) => setCartQty(row.id, n)}
                      onRemove={() => removeFromCart(row.id)}
                    />
                  ) : row.totalQty === 0 ? (
                    <button
                      disabled
                      title="Нет на складах"
                      className="btn h-9 w-full cursor-not-allowed whitespace-nowrap bg-gray-100 text-muted"
                    >
                      Нет в наличии
                    </button>
                  ) : (
                    <button
                      onClick={() => addToCart(row)}
                      className="btn-accent h-9 w-full whitespace-nowrap transition-all duration-200"
                    >
                      <ShoppingCart size={16} /> В корзину
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
