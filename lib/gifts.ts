import "server-only";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/cache";
import type { GiftRuleLite } from "@/lib/gift-earn";

// ─────────────────────────────────────────────────────────────────────────
//  Gift rules: buy ≥ minQty of ANY trigger product → the rule's gift products
//  are added to the order for free (price 0), with multiplicity (see
//  lib/gift-earn.ts). Cached; admin writes call invalidatePrefix("gifts:").
// ─────────────────────────────────────────────────────────────────────────

export type GiftRuleData = GiftRuleLite;

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

