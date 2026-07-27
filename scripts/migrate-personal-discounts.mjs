// Moves the legacy per-client discount (User.discountPercent) into the
// «Скидки» section as an ordinary rule, so every discount lives in exactly
// one place and stays visible to managers.
//
// For each client with discountPercent > 0 it creates an equivalent
// DiscountRule (kind DISCOUNT, target ALL, userId = client) and then zeroes
// the column. The resulting price is identical: lib/pricing.ts already takes
// the MAX of User.discountPercent and any ALL-target rule.
//
// Dry run by default:
//     node scripts/migrate-personal-discounts.mjs
// Apply:
//     node scripts/migrate-personal-discounts.mjs --yes
//
// Прод (Neon / riv.kz): передайте DATABASE_URL, как в set-password.mjs.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

try {
  const envFile = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // No .env — rely on the environment.
}

const apply = process.argv.includes("--yes");
const prisma = new PrismaClient();

const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "?";
console.log(`База: ${host}`);
console.log(apply ? "Режим: ПЕРЕНОС\n" : "Режим: проверка (--yes для переноса)\n");

const clients = await prisma.user.findMany({
  where: { discountPercent: { gt: 0 } },
  select: { id: true, login: true, fullName: true, discountPercent: true },
  orderBy: { login: "asc" },
});

if (clients.length === 0) {
  console.log("Клиентов с личной скидкой нет — переносить нечего.");
  await prisma.$disconnect();
  process.exit(0);
}

for (const c of clients) {
  // Skip clients that already have an equivalent blanket rule.
  const existing = await prisma.discountRule.findFirst({
    where: { userId: c.id, target: "ALL", kind: "DISCOUNT", active: true },
    select: { id: true, percent: true },
  });

  if (existing && existing.percent >= c.discountPercent) {
    console.log(
      `  ${c.login.padEnd(14)} ${String(c.discountPercent).padStart(3)}%  ` +
        `— уже есть правило на ${existing.percent}%, только обнуляем колонку`
    );
    if (apply) {
      await prisma.user.update({
        where: { id: c.id },
        data: { discountPercent: 0 },
      });
    }
    continue;
  }

  console.log(
    `  ${c.login.padEnd(14)} ${String(c.discountPercent).padStart(3)}%  → ` +
      `правило «Личная скидка — ${c.fullName}»`
  );
  if (apply) {
    await prisma.$transaction([
      prisma.discountRule.create({
        data: {
          name: `Личная скидка — ${c.fullName}`,
          kind: "DISCOUNT",
          percent: c.discountPercent,
          userId: c.id,
          target: "ALL",
          active: true,
        },
      }),
      prisma.user.update({
        where: { id: c.id },
        data: { discountPercent: 0 },
      }),
    ]);
  }
}

console.log(
  apply
    ? `\n✓ Перенесено клиентов: ${clients.length}. Проверьте раздел «Скидки».`
    : "\nНичего не изменено. Повторите с флагом --yes."
);
await prisma.$disconnect();
