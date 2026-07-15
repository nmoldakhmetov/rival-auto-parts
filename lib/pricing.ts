import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

// What a discount rule needs to know about a product to decide if it applies.
export type PricingProduct = {
  id: string;
  category: string | null;
  brand: string | null;
  // 1С is_final_price: the price is final — NO client discount may apply.
  isFinalPrice?: boolean;
};

export type DiscountContext = {
  // NET percent for a product, capped to [-95, 95]: positive = скидка,
  // negative = наценка (final price = base × (1 − pct/100)).
  pctFor: (p: PricingProduct) => number;
};

const NONE: DiscountContext = { pctFor: () => 0 };

// Per-scope best-percent accumulator (ALL / CATEGORY / BRAND / PRODUCT), used
// for both discounts and markups. The LARGEST applicable percent wins.
type ScopeMaps = {
  all: number;
  byCategory: Map<string, number>;
  byBrand: Map<string, number>;
  byProduct: Map<string, number>;
};
const emptyScope = (): ScopeMaps => ({
  all: 0,
  byCategory: new Map(),
  byBrand: new Map(),
  byProduct: new Map(),
});
const bestFor = (s: ScopeMaps, p: PricingProduct): number => {
  let pct = s.all;
  if (p.category) pct = Math.max(pct, s.byCategory.get(p.category) ?? 0);
  if (p.brand) pct = Math.max(pct, s.byBrand.get(p.brand) ?? 0);
  pct = Math.max(pct, s.byProduct.get(p.id) ?? 0);
  return Math.min(95, pct);
};

// Builds the pricing context for a client once, then resolves the NET percent
// per product: best discount minus best markup (negative net = наценка).
// Discount sources (the LARGEST wins):
//   • Setting `global_discount`        — всем клиентам, на всё
//   • User.discountPercent             — этому клиенту, на всё
//   • DiscountRule kind=DISCOUNT       — всем (userId=null) или этому клиенту
// Markup: DiscountRule kind=MARKUP, same scoping — and, critically, it applies
// to EVERY product, including isFinalPrice (which blocks discounts only).
// Staff (ADMIN/MANAGER/…) see base prices.
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

  const disc = emptyScope();
  const markup = emptyScope();
  disc.all = Math.max(me?.discountPercent ?? 0, parseInt(globalStr, 10) || 0);

  const bump = (m: Map<string, number>, k: string, v: number) =>
    m.set(k, Math.max(m.get(k) ?? 0, v));

  for (const r of rules) {
    const scope = r.kind === "MARKUP" ? markup : disc;
    switch (r.target) {
      case "ALL":
        scope.all = Math.max(scope.all, r.percent);
        break;
      case "CATEGORY":
        if (r.category) bump(scope.byCategory, r.category, r.percent);
        break;
      case "BRAND":
        if (r.brand) bump(scope.byBrand, r.brand, r.percent);
        break;
      case "PRODUCT":
        for (const p of r.products) bump(scope.byProduct, p.productId, r.percent);
        break;
    }
  }

  return {
    pctFor: (p) => {
      // isFinalPrice blocks the discount — but NEVER the markup.
      const d = p.isFinalPrice ? 0 : bestFor(disc, p);
      const m = bestFor(markup, p);
      return Math.max(-95, Math.min(95, d - m));
    },
  };
}

export type PricedFields = {
  price: number;
  oldPrice: number | null;
  discountPct: number;
};

// Pricing vs display are deliberately split:
//  • price   — the client's personal price: the 1С base (which already
//    reflects any sync price drop) minus the client's personal %.
//  • badge   — the strike-through/percent badge shows ONLY the 1С promo drop.
//    The personal discount is invisible in the UI: no 1С drop → no badge at
//    all, even when a personal discount lowered the price.
export function priceFor(
  base: number,
  oldPriceRaw: number | null,
  clientDiscPct: number
): PricedFields {
  const old = oldPriceRaw != null ? Number(oldPriceRaw) : null;
  const syncDropPct =
    old != null && old > base ? Math.round(((old - base) / old) * 100) : 0;
  const finalPrice = Math.round(base * (1 - clientDiscPct / 100));
  // A markup can push the final price ABOVE the 1С old price — showing a
  // strike-through lower than the actual price would be absurd, so the badge
  // only appears while the final price genuinely undercuts the old one.
  const showDrop = syncDropPct > 0 && old != null && old > finalPrice;
  return {
    price: finalPrice,
    oldPrice: showDrop ? old : null,
    discountPct: showDrop ? syncDropPct : 0,
  };
}
