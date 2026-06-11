import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getDiscountContext, priceFor } from "@/lib/pricing";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

// GET → { ids } (lightweight, used by the catalog hearts).
// GET ?full=1 → { ids, rows } with catalog-shaped rows (client pricing +
// stock limited to the client's granted warehouses) for the favorites page.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ids: [] });

  if (req.nextUrl.searchParams.get("full") !== "1") {
    const favs = await prisma.favorite.findMany({
      where: { userId: session.sub },
      select: { productId: true },
    });
    return NextResponse.json({ ids: favs.map((f) => f.productId) });
  }

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

  const [favs, disc] = await Promise.all([
    prisma.favorite.findMany({
      where: { userId: session.sub },
      orderBy: { createdAt: "desc" },
      include: {
        product: {
          include: {
            stocks: {
              where: allowedWhIds
                ? { warehouseId: { in: allowedWhIds } }
                : undefined,
              include: { warehouse: { select: { name: true } } },
              orderBy: { warehouse: { name: "asc" } },
            },
          },
        },
      },
    }),
    cached(`disc:${session.sub}`, 30_000, () =>
      getDiscountContext(session.sub, session.role)
    ),
  ]);

  const rows = favs
    .filter((f) => f.product)
    .map((f) => {
      const p = f.product;
      const stocks = p.stocks.map((s) => ({
        warehouse: s.warehouse.name,
        qty: s.qty,
      }));
      const priced = priceFor(
        Number(p.price),
        p.oldPrice != null ? Number(p.oldPrice) : null,
        disc.pctFor(p)
      );
      return {
        id: p.id,
        code: p.code,
        sku: p.sku,
        name: p.name,
        fullName: p.fullName,
        brand: p.brand,
        category: p.category,
        price: priced.price,
        oldPrice: priced.oldPrice,
        discountPct: priced.discountPct,
        imageUrl: p.imageUrl,
        stocks,
        totalQty: stocks.reduce((acc, s) => acc + s.qty, 0),
        viaAnalog: null,
        pinned: p.pinned,
        badge: p.badge,
      };
    });

  return NextResponse.json({ ids: rows.map((r) => r.id), rows });
}

// Toggle a product in the current user's favorites.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!body.productId) {
    return NextResponse.json({ error: "Нет товара" }, { status: 400 });
  }

  const where = {
    userId_productId: { userId: session.sub, productId: body.productId },
  };
  const existing = await prisma.favorite.findUnique({ where });
  if (existing) {
    await prisma.favorite.delete({ where });
    return NextResponse.json({ favorited: false });
  }
  await prisma.favorite
    .create({ data: { userId: session.sub, productId: body.productId } })
    .catch(() => {});
  return NextResponse.json({ favorited: true });
}
