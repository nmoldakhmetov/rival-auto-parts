import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

// Periodic housekeeping (runs every 10 min + on server start):
//  1. Auto-block: a CLIENT who has owed money for longer than `auto_block_days`
//     gets isActive=false (the manager unblocks manually). `debtSince` is
//     stamped when the balance first goes POSITIVE (balance = сумма долгов по
//     заказам, см. lib/balance) and cleared once the debt is paid off — so
//     paying always resets the countdown. NB: до этого здесь стояло обратное
//     сравнение (balance < 0), из-за чего должники не отмечались вовсе.
//  2. Expire price-drop discounts older than `price_drop_days`.
//  3. Drop stale auto-"новинка" stamps (cosmetic cleanup).

export type MaintenanceResult = {
  debtMarked: number;
  debtCleared: number;
  blocked: number;
  // Правила по бездействию (см. §4): сняли скидки / заблокировали за то,
  // что клиент давно не заказывал.
  idleDiscountsCleared: number;
  idleBlocked: number;
  dropsExpired: number;
  newExpired: number;
};

// Дата последнего заказа по каждому из переданных клиентов. Клиент без
// заказов «бездействует» с момента регистрации — иначе новый аккаунт,
// который ещё ничего не купил, никогда бы под правило не попал.
async function idleSince(userIds: string[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (userIds.length === 0) return out;

  const [users, lastOrders] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, createdAt: true },
    }),
    prisma.order.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _max: { createdAt: true },
    }),
  ]);

  for (const u of users) out.set(u.id, u.createdAt);
  for (const o of lastOrders) {
    if (o._max.createdAt) out.set(o.userId, o._max.createdAt);
  }
  return out;
}

export async function runMaintenance(): Promise<MaintenanceResult> {
  const now = new Date();
  const res: MaintenanceResult = {
    debtMarked: 0,
    debtCleared: 0,
    blocked: 0,
    idleDiscountsCleared: 0,
    idleBlocked: 0,
    dropsExpired: 0,
    newExpired: 0,
  };

  // ── 1. Debt tracking + auto-block ────────────────────────────────────
  const marked = await prisma.user.updateMany({
    where: { role: "CLIENT", balance: { gt: 0 }, debtSince: null },
    data: { debtSince: now },
  });
  res.debtMarked = marked.count;

  const cleared = await prisma.user.updateMany({
    where: { role: "CLIENT", balance: { lte: 0 }, debtSince: { not: null } },
    data: { debtSince: null },
  });
  res.debtCleared = cleared.count;

  const blockDays = parseInt(await getSetting("auto_block_days"), 10) || 0;
  if (blockDays > 0) {
    const cutoff = new Date(now.getTime() - blockDays * 86_400_000);
    const blocked = await prisma.user.updateMany({
      where: {
        role: "CLIENT",
        isActive: true,
        balance: { gt: 0 },
        debtSince: { lt: cutoff },
      },
      data: { isActive: false },
    });
    res.blocked = blocked.count;
  }

  // ── 1b. Клиент давно не заказывал ────────────────────────────────────
  //
  // Два независимых срока, оба по умолчанию 0 = выключено. Отсчёт идёт от
  // последнего заказа, а у ни разу не заказавшего — от регистрации.

  const idleDiscountDays =
    parseInt(await getSetting("idle_discount_days"), 10) || 0;
  if (idleDiscountDays > 0) {
    const cutoff = new Date(now.getTime() - idleDiscountDays * 86_400_000);
    // Только личные скидки. Правила «всем клиентам» не трогаем — это не
    // скидка конкретного клиента; наценки тем более (их снятие было бы
    // подарком).
    const rules = await prisma.discountRule.findMany({
      where: { active: true, kind: "DISCOUNT", userId: { not: null } },
      select: { id: true, userId: true },
    });
    const owners = [
      ...new Set(rules.map((r) => r.userId).filter((x): x is string => !!x)),
    ];
    const since = await idleSince(owners);
    const idle = new Set(
      owners.filter((id) => (since.get(id) ?? now) < cutoff)
    );
    if (idle.size > 0) {
      const ruleIds = rules
        .filter((r) => r.userId && idle.has(r.userId))
        .map((r) => r.id);
      // Правило выключается, а не удаляется: менеджер видит его в «Скидках»
      // и может включить обратно одним кликом.
      const off = await prisma.discountRule.updateMany({
        where: { id: { in: ruleIds } },
        data: { active: false },
      });
      // Legacy-колонка учитывается в ценообразовании наравне с правилами.
      const legacy = await prisma.user.updateMany({
        where: { id: { in: [...idle] }, discountPercent: { gt: 0 } },
        data: { discountPercent: 0 },
      });
      res.idleDiscountsCleared = off.count + legacy.count;
    }
  }

  const idleBlockDays = parseInt(await getSetting("idle_block_days"), 10) || 0;
  if (idleBlockDays > 0) {
    const cutoff = new Date(now.getTime() - idleBlockDays * 86_400_000);
    const active = await prisma.user.findMany({
      where: { role: "CLIENT", isActive: true },
      select: { id: true },
    });
    const ids = active.map((u) => u.id);
    const since = await idleSince(ids);
    const idle = ids.filter((id) => (since.get(id) ?? now) < cutoff);
    if (idle.length > 0) {
      // blockedByRole не ставим: блокировка автоматическая, и снять её
      // может менеджер — он же и вернёт клиента к заказам.
      const blockedIdle = await prisma.user.updateMany({
        where: { id: { in: idle } },
        data: { isActive: false },
      });
      res.idleBlocked = blockedIdle.count;
    }
  }

  // ── 2. Expire price-drop discounts ───────────────────────────────────
  const dropDays = parseInt(await getSetting("price_drop_days"), 10) || 0;
  if (dropDays > 0) {
    const cutoff = new Date(now.getTime() - dropDays * 86_400_000);
    const expired = await prisma.product.updateMany({
      where: { priceDropAt: { lt: cutoff } },
      data: { oldPrice: null, priceDropAt: null },
    });
    res.dropsExpired = expired.count;
  }

  // ── 3. Tidy expired auto-NEW stamps ──────────────────────────────────
  const newExpired = await prisma.product.updateMany({
    where: { newUntil: { lt: now } },
    data: { newUntil: null },
  });
  res.newExpired = newExpired.count;

  return res;
}
