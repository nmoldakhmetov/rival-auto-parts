import { Heart, ShoppingCart, User } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatTenge } from "@/lib/format";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Избранное и корзины — Админ-панель" };

type UserLite = { id: string; fullName: string; login: string };

export default async function ActivityPage() {
  const session = await getSession();
  // Manager → only their own clients' carts / favorites.
  const userScope =
    session?.role === "MANAGER" ? { user: { managerId: session.sub } } : {};

  const [cartItems, favItems] = await Promise.all([
    prisma.savedCartItem.findMany({
      where: userScope,
      include: {
        user: { select: { id: true, fullName: true, login: true } },
        product: { select: { sku: true, name: true, price: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.favorite.findMany({
      where: userScope,
      include: {
        user: { select: { id: true, fullName: true, login: true } },
        product: { select: { sku: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const cartByUser = new Map<
    string,
    {
      user: UserLite;
      items: { sku: string; name: string; qty: number; price: number }[];
    }
  >();
  for (const ci of cartItems) {
    const g = cartByUser.get(ci.user.id) ?? { user: ci.user, items: [] };
    g.items.push({
      sku: ci.product.sku,
      name: ci.product.name,
      qty: ci.qty,
      price: Number(ci.product.price),
    });
    cartByUser.set(ci.user.id, g);
  }

  const favByUser = new Map<
    string,
    { user: UserLite; items: { sku: string; name: string }[] }
  >();
  for (const f of favItems) {
    const g = favByUser.get(f.user.id) ?? { user: f.user, items: [] };
    g.items.push({ sku: f.product.sku, name: f.product.name });
    favByUser.set(f.user.id, g);
  }

  const carts = [...cartByUser.values()];
  const favs = [...favByUser.values()];

  return (
    <div className="px-6 py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Избранное и корзины</h1>
      <p className="mb-5 text-xs text-muted">
        Что клиенты сейчас держат в корзинах и в избранном.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Carts */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <ShoppingCart size={16} className="text-accent" /> Корзины клиентов
            <span className="text-xs font-normal text-muted">
              ({carts.length})
            </span>
          </h2>
          {carts.length === 0 ? (
            <EmptyBox text="Ни у кого нет товаров в корзине." />
          ) : (
            <div className="space-y-3">
              {carts.map((c) => {
                const sum = c.items.reduce((a, i) => a + i.qty * i.price, 0);
                return (
                  <div
                    key={c.user.id}
                    className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"
                  >
                    <ClientHead user={c.user} right={formatTenge(sum)} />
                    <table className="data-table">
                      <tbody>
                        {c.items.map((i, idx) => (
                          <tr key={i.sku + idx}>
                            <td className="w-32 font-semibold text-ink">
                              {i.sku}
                            </td>
                            <td className="text-muted">{i.name}</td>
                            <td className="w-16 text-center">× {i.qty}</td>
                            <td className="w-28 text-right font-medium text-ink">
                              {formatTenge(i.qty * i.price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Favorites */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <Heart size={16} className="text-accent" /> Избранное клиентов
            <span className="text-xs font-normal text-muted">
              ({favs.length})
            </span>
          </h2>
          {favs.length === 0 ? (
            <EmptyBox text="Ни у кого нет избранных товаров." />
          ) : (
            <div className="space-y-3">
              {favs.map((f) => (
                <div
                  key={f.user.id}
                  className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"
                >
                  <ClientHead
                    user={f.user}
                    right={`${f.items.length} тов.`}
                  />
                  <ul className="divide-y divide-line">
                    {f.items.map((i, idx) => (
                      <li
                        key={i.sku + idx}
                        className="flex items-center gap-3 px-4 py-2 text-sm"
                      >
                        <span className="font-semibold text-ink">{i.sku}</span>
                        <span className="truncate text-muted">{i.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ClientHead({ user, right }: { user: UserLite; right: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line bg-gray-50 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent">
          <User size={14} />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink">{user.fullName}</div>
          <div className="text-[11px] text-muted">{user.login}</div>
        </div>
      </div>
      <span className="text-sm font-bold text-accent">{right}</span>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-line bg-white py-12 text-center text-sm text-muted">
      {text}
    </div>
  );
}
