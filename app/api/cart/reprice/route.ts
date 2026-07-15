import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getDiscountContext, priceFor } from "@/lib/pricing";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Re-prices the persisted local cart: the client stores price snapshots in
// localStorage, which go stale when an admin edits discount rules or the 1С
// sync moves prices. The cart page calls this on mount and refreshes the
// display, so «Итого» always matches what /api/orders will actually charge.
// (Ordering itself never trusts these numbers — it re-prices server-side.)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .filter((x): x is string => typeof x === "string")
    .slice(0, 500);
  if (ids.length === 0) return NextResponse.json({ prices: {} });

  const [products, disc, dropDaysStr] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: ids } } }),
    getDiscountContext(session.sub, session.role),
    getSetting("price_drop_days"),
  ]);

  // Same strike-through lifetime rule as /api/products/search.
  const dropDays = parseInt(dropDaysStr, 10) || 0;
  const dropCutoffMs = Date.now() - dropDays * 86_400_000;

  const prices: Record<
    string,
    { price: number; oldPrice: number | null; discountPct: number }
  > = {};
  for (const p of products) {
    const dropActive =
      p.oldPrice != null &&
      (dropDays <= 0 ||
        (p.priceDropAt != null && p.priceDropAt.getTime() > dropCutoffMs));
    prices[p.id] = priceFor(
      Number(p.price),
      dropActive && p.oldPrice != null ? Number(p.oldPrice) : null,
      disc.pctFor(p)
    );
  }
  return NextResponse.json({ prices });
}
