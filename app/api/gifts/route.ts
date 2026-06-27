import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getDiscountContext, priceFor } from "@/lib/pricing";
import { cached } from "@/lib/cache";
import { getSetting } from "@/lib/settings";
import { capStockForClient } from "@/lib/stock";
import { getActiveGiftRules } from "@/lib/gifts";
import type { CatalogRow } from "@/lib/types";

export const dynamic = "force-dynamic";

// Active gift rules + the gift products as catalog cards (client pricing +
// stock). The catalog uses triggerIds → banner; the cart uses them to surface
// the earned gift; both render the gift card from `giftProducts`.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ rules: [], giftProducts: {}, discountDisplay: "percent" });
  }

  const rules = await getActiveGiftRules();
  if (rules.length === 0) {
    return NextResponse.json({ rules: [], giftProducts: {}, discountDisplay: "percent" });
  }

  const giftIds = [...new Set(rules.flatMap((r) => r.giftIds))];

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

  const [products, disc, dropDaysStr, discountDisplay] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: giftIds } },
      include: {
        stocks: {
          where: allowedWhIds ? { warehouseId: { in: allowedWhIds } } : undefined,
          include: { warehouse: { select: { name: true } } },
          orderBy: { warehouse: { name: "asc" } },
        },
      },
    }),
    cached(`disc:${session.sub}`, 30_000, () =>
      getDiscountContext(session.sub, session.role)
    ),
    cached("cfg:price_drop_days", 60_000, () => getSetting("price_drop_days")),
    cached("cfg:discount_display", 60_000, () => getSetting("discount_display")),
  ]);
  const dropDays = parseInt(dropDaysStr, 10) || 0;
  const nowMs = Date.now();
  const dropCutoffMs = nowMs - dropDays * 86_400_000;
  const isClient = session.role === "CLIENT";

  const giftProducts: Record<string, CatalogRow> = {};
  for (const p of products) {
    const stocks = capStockForClient(
      p.stocks.map((s) => ({ warehouse: s.warehouse.name, qty: s.qty })),
      isClient
    );
    const dropActive =
      p.oldPrice != null &&
      (dropDays <= 0 ||
        (p.priceDropAt != null && p.priceDropAt.getTime() > dropCutoffMs));
    const priced = priceFor(
      Number(p.price),
      dropActive && p.oldPrice != null ? Number(p.oldPrice) : null,
      disc.pctFor(p)
    );
    giftProducts[p.id] = {
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
      totalQty: stocks.reduce((a, s) => a + s.qty, 0),
      viaAnalog: null,
      pinned: p.pinned,
      badge:
        p.badge ?? (p.newUntil != null && p.newUntil.getTime() > nowMs ? "NEW" : null),
    };
  }

  // Only return rules whose gift products still exist.
  const valid = rules
    .map((r) => ({
      id: r.id,
      minQty: r.minQty,
      triggerIds: r.triggerIds,
      giftIds: r.giftIds.filter((id) => giftProducts[id]),
    }))
    .filter((r) => r.giftIds.length > 0);

  return NextResponse.json({ rules: valid, giftProducts, discountDisplay });
}
