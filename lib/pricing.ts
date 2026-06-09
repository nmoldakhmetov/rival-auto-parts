import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

// What a discount rule needs to know about a product to decide if it applies.
export type PricingProduct = {
  id: string;
  category: string | null;
  brand: string | null;
};

export type DiscountContext = {
  // Effective discount % for a given product (already capped at 95).
  pctFor: (p: PricingProduct) => number;
};

const NONE: DiscountContext = { pctFor: () => 0 };

// Builds the discount context for a client once, then resolves the best
// applicable percent per product. Sources (the LARGEST wins):
//   • Setting `global_discount`        — всем клиентам, на всё
//   • User.discountPercent             — этому клиенту, на всё
//   • DiscountRule (active)            — всем (userId=null) или этому клиенту,
//     с целью ALL / PRODUCT / CATEGORY / BRAND
// Staff (ADMIN/MANAGER) get no discount.
export async function getDiscountContext(
  userId: string,
  role: string
): Promise<DiscountContext> {
  if (role !== "CLIENT") return NONE;

  const [me, globalStr, rules] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { discountPercent: true },
    }),
    getSetting("global_discount"),
    prisma.discountRule.findMany({
      where: { active: true, OR: [{ userId }, { userId: null }] },
      include: { products: { select: { productId: true } } },
    }),
  ]);

  let baseAll = Math.max(me?.discountPercent ?? 0, parseInt(globalStr, 10) || 0);
  const byCategory = new Map<string, number>();
  const byBrand = new Map<string, number>();
  const byProduct = new Map<string, number>();

  const bump = (m: Map<string, number>, k: string, v: number) =>
    m.set(k, Math.max(m.get(k) ?? 0, v));

  for (const r of rules) {
    const pct = r.percent;
    switch (r.target) {
      case "ALL":
        baseAll = Math.max(baseAll, pct);
        break;
      case "CATEGORY":
        if (r.category) bump(byCategory, r.category, pct);
        break;
      case "BRAND":
        if (r.brand) bump(byBrand, r.brand, pct);
        break;
      case "PRODUCT":
        for (const p of r.products) bump(byProduct, p.productId, pct);
        break;
    }
  }

  const hasTargeted =
    byCategory.size > 0 || byBrand.size > 0 || byProduct.size > 0;
  if (!hasTargeted) {
    const flat = Math.min(95, baseAll);
    return { pctFor: () => flat };
  }

  return {
    pctFor: (p) => {
      let pct = baseAll;
      if (p.category) pct = Math.max(pct, byCategory.get(p.category) ?? 0);
      if (p.brand) pct = Math.max(pct, byBrand.get(p.brand) ?? 0);
      pct = Math.max(pct, byProduct.get(p.id) ?? 0);
      return Math.min(95, pct);
    },
  };
}

export type PricedFields = {
  price: number;
  oldPrice: number | null;
  discountPct: number;
};

// Combines the client discount with any price drop from the last 1С sync.
// The sync-drop % SUMS on top of the client discount (capped at 95%).
export function priceFor(
  base: number,
  oldPriceRaw: number | null,
  clientDiscPct: number
): PricedFields {
  const old = oldPriceRaw != null ? Number(oldPriceRaw) : null;
  const syncDropPct =
    old != null && old > base ? Math.round(((old - base) / old) * 100) : 0;
  const totalPct = Math.min(95, clientDiscPct + syncDropPct);
  const finalPrice = Math.round(base * (1 - clientDiscPct / 100));
  return {
    price: finalPrice,
    oldPrice: totalPct > 0 ? (old != null && old > base ? old : base) : null,
    discountPct: totalPct,
  };
}
