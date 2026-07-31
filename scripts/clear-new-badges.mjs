// Снимает значок «Новинка» со всех товаров сразу.
//
// Зачем: при первом импорте каталога в пустую базу новыми оказываются ВСЕ
// товары, и «Новинка» повисает на всей витрине. Этот скрипт разово чистит
// признак; сам синк с 1С после исправления первый импорт больше так не метит.
//
//   node scripts/clear-new-badges.mjs          — только отчёт
//   node scripts/clear-new-badges.mjs --yes    — снять значки
//
// Флаг --keep-manual оставит значки, выставленные вручную в админке
// (Product.badge), и снимет только автоматические (Product.newUntil).
//
// Прод: передайте DATABASE_URL, как в остальных скриптах.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const f of ["../.env", "../.env.local"]) {
  try {
    for (const line of readFileSync(new URL(f, import.meta.url), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const apply = process.argv.includes("--yes");
const keepManual = process.argv.includes("--keep-manual");
const prisma = new PrismaClient();

const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "?";
console.log(`База:  ${host}`);
console.log(`Режим: ${apply ? "ОЧИСТКА" : "проверка (--yes чтобы применить)"}\n`);

const total = await prisma.product.count();
const autoNew = await prisma.product.count({ where: { newUntil: { not: null } } });
const manualNew = await prisma.product.count({ where: { badge: "NEW" } });
const manualHit = await prisma.product.count({ where: { badge: "HIT" } });

console.log(`Всего товаров:                     ${total}`);
console.log(`С авто-значком «Новинка»:          ${autoNew}`);
console.log(`С ручным значком «Новинка»:        ${manualNew}`);
console.log(`С ручным значком «Хит продаж»:     ${manualHit}  (не трогаем)`);

if (autoNew === 0 && (keepManual || manualNew === 0)) {
  console.log("\nСнимать нечего.");
  await prisma.$disconnect();
  process.exit(0);
}

if (!apply) {
  console.log(
    `\nБудет снято: авто-значков ${autoNew}` +
      (keepManual ? " (ручные оставляем)" : `, ручных «Новинка» ${manualNew}`)
  );
  console.log("Ничего не изменено. Повторите с флагом --yes.");
  await prisma.$disconnect();
  process.exit(0);
}

const auto = await prisma.product.updateMany({
  where: { newUntil: { not: null } },
  data: { newUntil: null },
});
console.log(`\n✓ Снят авто-значок: ${auto.count}`);

if (!keepManual) {
  const manual = await prisma.product.updateMany({
    where: { badge: "NEW" },
    data: { badge: null },
  });
  console.log(`✓ Снят ручной значок «Новинка»: ${manual.count}`);
}

console.log("\nГотово. Значок «Хит продаж» не затронут.");
await prisma.$disconnect();
