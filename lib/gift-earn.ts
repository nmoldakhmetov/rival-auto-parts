// Pure gift-earning math, shared by the server (order placement) and the
// client (cart page, mini-cart indicator). No prisma / no "server-only" here.

export type GiftRuleLite = {
  id: string;
  minQty: number;
  triggerIds: string[];
  giftIds: string[];
};

// Gift quantities earned by the current cart, with multiplicity: every full
// `minQty` of a trigger product earns one more set of the rule's gifts
// («от 2 шт» → 4 шт = 2 подарка, 6 шт = 3). Each trigger product contributes
// its own multiples; rules stack per gift product (deduplicated by summing).
export function earnedGiftQty(
  rules: GiftRuleLite[],
  qtyById: Map<string, number>
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rules) {
    const minQty = Math.max(1, r.minQty);
    let mult = 0;
    for (const id of r.triggerIds) {
      mult += Math.floor((qtyById.get(id) ?? 0) / minQty);
    }
    if (mult > 0) {
      for (const g of r.giftIds) out.set(g, (out.get(g) ?? 0) + mult);
    }
  }
  return out;
}

// Total number of gift units (for the mini-cart indicator).
export function totalGiftUnits(earned: Map<string, number>): number {
  let n = 0;
  for (const q of earned.values()) n += q;
  return n;
}
