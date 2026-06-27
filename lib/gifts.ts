import "server-only";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";

// ─────────────────────────────────────────────────────────────────────────
//  Gift rules: buy ≥ minQty of ANY trigger product → the rule's gift products
//  are added to the order for free (price 0). Triggers/gifts are concrete
//  products. Cached; admin writes call invalidatePrefix("gifts:").
// ─────────────────────────────────────────────────────────────────────────

export type GiftRuleData = {
  id: string;
  minQty: number;
  triggerIds: string[];
  giftIds: string[];
};

export async function getActiveGiftRules(): Promise<GiftRuleData[]> {
  return cached("gifts:active", 60_000, async () => {
    const rules = await prisma.giftRule.findMany({
      where: { active: true },
      include: {
        triggers: { select: { productId: true } },
        gifts: { select: { productId: true } },
      },
    });
    return rules
      .map((r) => ({
        id: r.id,
        minQty: Math.max(1, r.minQty),
        triggerIds: r.triggers.map((t) => t.productId),
        giftIds: r.gifts.map((g) => g.productId),
      }))
      .filter((r) => r.triggerIds.length > 0 && r.giftIds.length > 0);
  });
}

// Given cart quantities by productId, return the gift productIds earned. A rule
// fires when ANY of its trigger products reaches minQty; the union of all fired
// rules' gifts is returned (deduplicated).
export function earnedGiftIds(
  rules: GiftRuleData[],
  qtyById: Map<string, number>
): string[] {
  const gifts = new Set<string>();
  for (const r of rules) {
    const fired = r.triggerIds.some((id) => (qtyById.get(id) ?? 0) >= r.minQty);
    if (fired) for (const g of r.giftIds) gifts.add(g);
  }
  return [...gifts];
}
