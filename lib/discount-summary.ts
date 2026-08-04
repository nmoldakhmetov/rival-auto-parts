import "server-only";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

// Короткая сводка «что сейчас у клиента по скидкам» — чтобы в «Клиентах» и
// «Заказах» было видно процент, не проваливаясь каждый раз в раздел «Скидки».
//
// Показываем ставку на ВСЁ (её видно одним числом) отдельно от адресных
// правил: у правил на категорию/марку/товар нет общего процента, их можно
// только пересчитать, поэтому они идут счётчиком «+N прав.».
//
// Считается по тем же источникам, что и цена в lib/pricing.ts:
//   скидка = max(global_discount, User.discountPercent, DISCOUNT-правила ALL)
//   наценка = max(MARKUP-правила ALL)
//   итог   = скидка − наценка
// Правила с userId = null действуют на всех клиентов и тоже попадают в расчёт.

export type DiscountSummary = {
  discount: number; // лучшая скидка на всё, %
  markup: number; // лучшая наценка на всё, %
  net: number; // итог: скидка − наценка (минус = наценка)
  targeted: number; // сколько активных правил на категорию/марку/товар
};

export const EMPTY_SUMMARY: DiscountSummary = {
  discount: 0,
  markup: 0,
  net: 0,
  targeted: 0,
};

export async function discountSummaries(
  userIds: string[]
): Promise<Map<string, DiscountSummary>> {
  const out = new Map<string, DiscountSummary>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const [globalStr, users, rules] = await Promise.all([
    getSetting("global_discount"),
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, discountPercent: true },
    }),
    prisma.discountRule.findMany({
      where: { active: true, OR: [{ userId: { in: ids } }, { userId: null }] },
      select: { userId: true, kind: true, percent: true, target: true },
    }),
  ]);

  const globalPct = parseInt(globalStr, 10) || 0;
  for (const u of users) {
    out.set(u.id, {
      ...EMPTY_SUMMARY,
      discount: Math.max(globalPct, u.discountPercent ?? 0),
    });
  }

  for (const r of rules) {
    // Правило «всем» (userId = null) раскладывается на каждого клиента.
    const targets = r.userId ? [r.userId] : ids;
    for (const id of targets) {
      const s = out.get(id);
      if (!s) continue;
      if (r.target !== "ALL") {
        s.targeted += 1;
        continue;
      }
      if (r.kind === "MARKUP") s.markup = Math.max(s.markup, r.percent);
      else s.discount = Math.max(s.discount, r.percent);
    }
  }

  for (const s of out.values()) {
    // Тот же зажим, что в pricing.ts: net не выходит за ±95.
    s.net = Math.max(-95, Math.min(95, s.discount - s.markup));
  }
  return out;
}
