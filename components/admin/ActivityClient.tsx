"use client";

import { Fragment, useState } from "react";
import { ChevronDown, Heart, ShoppingCart, User } from "lucide-react";
import { formatTenge, formatDateTime } from "@/lib/format";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export type ActivityRow = {
  user: { id: string; fullName: string; login: string };
  cart: { sku: string; name: string; qty: number; price: number }[];
  favorites: { sku: string; name: string }[];
  lastActivity: string; // ISO — свежая из корзины/избранного, для сортировки и колонки
};

// Список клиентов с раскрывающейся строкой — тот же паттерн, что в разделе
// «Заказы»: клик по строке разворачивает корзину и избранное клиента.
export default function ActivityClient({ rows }: { rows: ActivityRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="data-table min-w-[720px]">
        <thead>
          <tr>
            <th className="w-8"></th>
            <th>Клиент</th>
            <th className="w-56">Корзина</th>
            <th className="w-32">Избранное</th>
            <th className="w-40">Активность</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-12 text-center text-sm text-muted">
                Ни у кого нет товаров в корзине или избранном.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const cartSum = r.cart.reduce((a, i) => a + i.qty * i.price, 0);
            const open = openId === r.user.id;
            return (
              <Fragment key={r.user.id}>
                <tr
                  onClick={() => setOpenId(open ? null : r.user.id)}
                  title="Показать корзину и избранное"
                  className="cursor-pointer"
                >
                  <td>
                    <span
                      className={cx(
                        "flex h-6 w-6 items-center justify-center rounded text-muted transition-all duration-200",
                        open && "rotate-180 bg-accent/10 text-accent"
                      )}
                    >
                      <ChevronDown size={15} />
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                        <User size={14} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-ink">
                          {r.user.fullName}
                        </div>
                        <div className="text-[11px] text-muted">
                          {r.user.login}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {r.cart.length > 0 ? (
                      <span className="text-sm">
                        {r.cart.length} поз. ·{" "}
                        <b className="text-ink">{formatTenge(cartSum)}</b>
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    {r.favorites.length > 0 ? (
                      <span className="text-sm">{r.favorites.length} тов.</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="text-[11px] text-muted">
                    {formatDateTime(r.lastActivity)}
                  </td>
                </tr>

                {/* ── Развёрнуто: корзина + избранное клиента ─────────── */}
                {open && (
                  <tr>
                    <td colSpan={5} className="!p-0">
                      <div className="animate-fade-in-up grid gap-4 border-y border-line bg-gray-50/70 px-4 py-4 sm:px-6 lg:grid-cols-2">
                        <section>
                          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
                            <ShoppingCart size={14} className="text-accent" />
                            Корзина
                            {r.cart.length > 0 && (
                              <span className="font-normal text-muted">
                                ({r.cart.length} поз. · {formatTenge(cartSum)})
                              </span>
                            )}
                          </h3>
                          {r.cart.length === 0 ? (
                            <div className="rounded-lg border border-line bg-white px-4 py-6 text-center text-xs text-muted">
                              Корзина пуста.
                            </div>
                          ) : (
                            <div className="overflow-hidden rounded-lg border border-line bg-white">
                              <table className="data-table">
                                <tbody>
                                  {r.cart.map((i, idx) => (
                                    <tr key={i.sku + idx}>
                                      <td className="w-32 font-semibold text-ink">
                                        {i.sku}
                                      </td>
                                      <td className="text-muted">{i.name}</td>
                                      <td className="w-16 text-center">
                                        × {i.qty}
                                      </td>
                                      <td className="w-28 text-right font-medium text-ink">
                                        {formatTenge(i.qty * i.price)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </section>

                        <section>
                          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
                            <Heart size={14} className="text-accent" />
                            Избранное
                            {r.favorites.length > 0 && (
                              <span className="font-normal text-muted">
                                ({r.favorites.length} тов.)
                              </span>
                            )}
                          </h3>
                          {r.favorites.length === 0 ? (
                            <div className="rounded-lg border border-line bg-white px-4 py-6 text-center text-xs text-muted">
                              Избранного нет.
                            </div>
                          ) : (
                            <ul className="divide-y divide-line rounded-lg border border-line bg-white">
                              {r.favorites.map((i, idx) => (
                                <li
                                  key={i.sku + idx}
                                  className="flex items-center gap-3 px-4 py-2 text-sm"
                                >
                                  <span className="shrink-0 font-semibold text-ink">
                                    {i.sku}
                                  </span>
                                  <span className="truncate text-muted">
                                    {i.name}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </section>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
