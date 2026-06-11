import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

// Periodic housekeeping (runs every 10 min + on server start):
//  1. Auto-block: a CLIENT whose balance has been negative for longer than
//     `auto_block_days` gets isActive=false (the manager unblocks manually).
//     `debtSince` is stamped when the balance first goes negative and cleared
//     once it recovers — so paying the debt always resets the countdown.
//  2. Expire price-drop discounts older than `price_drop_days`.
//  3. Drop stale auto-"новинка" stamps (cosmetic cleanup).

export type MaintenanceResult = {
  debtMarked: number;
  debtCleared: number;
  blocked: number;
  dropsExpired: number;
  newExpired: number;
};

export async function runMaintenance(): Promise<MaintenanceResult> {
  const now = new Date();
  const res: MaintenanceResult = {
    debtMarked: 0,
    debtCleared: 0,
    blocked: 0,
    dropsExpired: 0,
    newExpired: 0,
  };

  // ── 1. Debt tracking + auto-block ────────────────────────────────────
  const marked = await prisma.user.updateMany({
    where: { role: "CLIENT", balance: { lt: 0 }, debtSince: null },
    data: { debtSince: now },
  });
  res.debtMarked = marked.count;

  const cleared = await prisma.user.updateMany({
    where: { role: "CLIENT", balance: { gte: 0 }, debtSince: { not: null } },
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
        balance: { lt: 0 },
        debtSince: { lt: cutoff },
      },
      data: { isActive: false },
    });
    res.blocked = blocked.count;
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
