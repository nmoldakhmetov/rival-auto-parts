import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getDiscountContext, priceFor } from "@/lib/pricing";
import { cached } from "@/lib/cache";
import { getSetting } from "@/lib/settings";
import { productTitle } from "@/lib/product-title";

export const dynamic = "force-dynamic";

// POST { productIds: string[] } → current cart-ready data for those products
// (live price with the client's discounts, stock across their warehouses).
// Used by «Повторить заказ»: the cart must be filled with TODAY's prices and
// availability, not the snapshot stored on the old order.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { productIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const ids = [...new Set((body.productIds ?? []).filter(Boolean))].slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ rows: [] });

  let allowedWhIds: string[] | null = null;
  if (session.role === "CLIENT") {
    allowedWhIds = await cached(`wh:${session.sub}`, 30_000, async () => {
      const access = await prisma.clientWarehouseAccess.findMany({
        where: { userId: session.sub },
        select: { warehouseId: true },
      });
      return access.map((a) => a.warehouseId);
    });
  }

  const [products, disc, dropDaysStr] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        stocks: {
          where: allowedWhIds ? { warehouseId: { in: allowedWhIds } } : undefined,
          select: { qty: true },
        },
      },
    }),
    cached(`disc:${session.sub}`, 30_000, () =>
      getDiscountContext(session.sub, session.role)
    ),
    cached("cfg:price_drop_days", 60_000, () => getSetting("price_drop_days")),
  ]);
  const dropDays = parseInt(dropDaysStr, 10) || 0;
  const dropCutoffMs = Date.now() - dropDays * 86_400_000;

  const rows = products.map((p) => {
    const dropActive =
      p.oldPrice != null &&
      (dropDays <= 0 ||
        (p.priceDropAt != null && p.priceDropAt.getTime() > dropCutoffMs));
    const priced = priceFor(
      Number(p.price),
      dropActive && p.oldPrice != null ? Number(p.oldPrice) : null,
      disc.pctFor(p)
    );
    return {
      id: p.id,
      sku: p.sku,
      // Строка уходит прямо в корзину, поэтому имя здесь — то, что увидит
      // смотрящий: клиенту применяемость, служебное имя 1С не показываем.
      name: productTitle(p, session.role),
      category: p.category,
      price: priced.price,
      oldPrice: priced.oldPrice,
      discountPct: priced.discountPct,
      imageUrl: p.imageUrl,
      totalQty: p.stocks.reduce((acc, s) => acc + s.qty, 0),
    };
  });

  return NextResponse.json({ rows });
}
