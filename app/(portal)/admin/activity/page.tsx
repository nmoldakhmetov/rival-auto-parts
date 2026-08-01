import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import ActivityClient, {
  type ActivityRow,
} from "@/components/admin/ActivityClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Избранное и корзины — Админ-панель" };

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

  // Один список клиентов: корзина и избранное складываются в одну строку.
  const byUser = new Map<string, ActivityRow>();
  const rowFor = (user: ActivityRow["user"]): ActivityRow => {
    let r = byUser.get(user.id);
    if (!r) {
      r = { user, cart: [], favorites: [], lastActivity: "" };
      byUser.set(user.id, r);
    }
    return r;
  };
  const bumpActivity = (r: ActivityRow, d: Date) => {
    const iso = d.toISOString();
    if (iso > r.lastActivity) r.lastActivity = iso;
  };

  for (const ci of cartItems) {
    const r = rowFor(ci.user);
    r.cart.push({
      sku: ci.product.sku,
      name: ci.product.name,
      qty: ci.qty,
      price: Number(ci.product.price),
    });
    bumpActivity(r, ci.updatedAt);
  }
  for (const f of favItems) {
    const r = rowFor(f.user);
    r.favorites.push({ sku: f.product.sku, name: f.product.name });
    bumpActivity(r, f.createdAt);
  }

  // Свежая активность сверху — менеджеру важнее то, что происходит сейчас.
  const rows = [...byUser.values()].sort((a, b) =>
    b.lastActivity.localeCompare(a.lastActivity)
  );

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="mb-1 text-xl font-bold text-ink">Избранное и корзины</h1>
      <p className="mb-5 text-xs text-muted">
        Что клиенты сейчас держат в корзинах и в избранном. Нажмите на клиента,
        чтобы раскрыть список.
      </p>
      <ActivityClient rows={rows} />
    </div>
  );
}
