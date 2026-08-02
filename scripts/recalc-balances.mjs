// Пересчитывает баланс всех клиентов по формуле:
//
//     balance = Σ (total − paid) по заказам в статусах
//               «В работе» · «Выдано» · «Выполнен»
//
// Положительное значение = долг. Заявка, ещё не взятая в работу, и «Отказ
// клиента» долгом не считаются. Раньше долг прибавлялся к балансу один раз
// при переводе заказа в «Выдано», поэтому новые заказы в баланс не попадали,
// а правка «оплачено» его не уменьшала. Скрипт разово приводит боевые данные
// к формуле — дальше баланс поддерживает сам портал (lib/balance.ts).
//
// ⚠ Список статусов продублирован здесь намеренно: скрипт запускается на
// проде отдельно от сборки и не может импортировать server-only модуль.
// Если меняете DEBT_STATUSES в lib/balance.ts — поправьте и здесь.
//
//   node scripts/recalc-balances.mjs          — только отчёт, что изменится
//   node scripts/recalc-balances.mjs --yes    — записать новые балансы
//
// ⚠ Значения, выставленные раньше вручную в карточке клиента, будут заменены
// расчётными. Отчёт печатает старое и новое значение по каждому клиенту —
// сверьте его перед применением.
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
const prisma = new PrismaClient();

const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "?";
console.log(`База:  ${host}`);
console.log(`Режим: ${apply ? "ЗАПИСЬ" : "проверка (--yes чтобы применить)"}\n`);

const fmt = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₸";

const clients = await prisma.user.findMany({
  where: { role: "CLIENT" },
  select: { id: true, login: true, fullName: true, balance: true },
  orderBy: { login: "asc" },
});

// Долги считаем одним запросом, а не по клиенту — на боевой базе клиентов
// сотни, и по два запроса на каждого превратились бы в тысячи round-trip'ов.
const DEBT_STATUSES = ["PROCESSING", "ISSUED", "COMPLETED"];

const sums = await prisma.order.groupBy({
  by: ["userId"],
  where: { status: { in: DEBT_STATUSES } },
  _sum: { total: true, paid: true },
});
const debtByUser = new Map(
  sums.map((s) => [s.userId, Number(s._sum.total ?? 0) - Number(s._sum.paid ?? 0)])
);

const changes = [];
for (const c of clients) {
  const was = Number(c.balance);
  const now = debtByUser.get(c.id) ?? 0;
  if (Math.abs(was - now) >= 0.01) changes.push({ c, was, now });
}

console.log(`Клиентов в базе:        ${clients.length}`);
console.log(`С заказами в работе:    ${debtByUser.size}`);
console.log(`Баланс изменится у:     ${changes.length}\n`);

if (changes.length > 0) {
  console.log("Логин                Клиент                          Было → Станет");
  console.log("─".repeat(88));
  for (const { c, was, now } of changes) {
    const login = c.login.padEnd(20).slice(0, 20);
    const name = (c.fullName ?? "").padEnd(30).slice(0, 30);
    const mark = now > 0 ? " (долг)" : "";
    console.log(`${login} ${name} ${fmt(was)} → ${fmt(now)}${mark}`);
  }
  console.log("");
}

const totalDebt = [...debtByUser.values()].reduce((a, d) => a + Math.max(0, d), 0);
console.log(`Суммарный долг по формуле: ${fmt(totalDebt)}\n`);

if (!apply) {
  console.log("Ничего не записано. Повторите с --yes, чтобы применить.");
} else if (changes.length === 0) {
  console.log("Все балансы уже совпадают с формулой — записывать нечего.");
} else {
  for (const { c, now } of changes) {
    await prisma.user.update({ where: { id: c.id }, data: { balance: now } });
  }
  console.log(`Готово: обновлено балансов — ${changes.length}.`);
  console.log(
    "Напоминание: авто-блокировка должников считает срок от debtSince,\n" +
      "который проставится при ближайшем обслуживании (раз в 10 минут).\n" +
      "Если блокировать никого не нужно — поставьте «Автоблокировка» = 0 в Настройках."
  );
}

await prisma.$disconnect();
