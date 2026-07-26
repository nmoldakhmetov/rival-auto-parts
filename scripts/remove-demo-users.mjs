// Removes the demo accounts that early builds seeded (manager / client / ra /
// accountant). The ADMIN account is never touched.
//
// Dry run by default — prints exactly what would be deleted:
//     node scripts/remove-demo-users.mjs
// Actually delete:
//     node scripts/remove-demo-users.mjs --yes
//
// Прод (Neon): передайте DATABASE_URL из Vercel, как в set-password.mjs.
//
// ⚠ Заказы демо-клиента удалятся вместе с ним (Order.userId onDelete: Cascade);
// возвраты/просмотры/логи поиска сохранятся с userId = null.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const DEMO_LOGINS = ["manager", "client", "ra", "accountant"];

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
console.log(apply ? "Режим: УДАЛЕНИЕ\n" : "Режим: проверка (--yes для удаления)\n");

const users = await prisma.user.findMany({
  where: { login: { in: DEMO_LOGINS } },
  select: {
    id: true,
    login: true,
    role: true,
    fullName: true,
    _count: { select: { orders: true, returns: true, clients: true } },
  },
});

if (users.length === 0) {
  console.log("Демо-аккаунтов не найдено — база уже чистая.");
  await prisma.$disconnect();
  process.exit(0);
}

for (const u of users) {
  console.log(
    `  ${u.login.padEnd(11)} ${u.role.padEnd(10)} ${u.fullName}\n` +
      `      заказов: ${u._count.orders} (будут удалены) · ` +
      `возвратов: ${u._count.returns} (останутся, без владельца) · ` +
      `закреплённых клиентов: ${u._count.clients} (останутся, без менеджера)`
  );
}

const admins = await prisma.user.count({ where: { role: "ADMIN" } });
console.log(`\nАдминистраторов в базе: ${admins} (не затрагиваются).`);

if (!apply) {
  console.log("\nНичего не удалено. Повторите с флагом --yes.");
  await prisma.$disconnect();
  process.exit(0);
}

const res = await prisma.user.deleteMany({
  where: { id: { in: users.map((u) => u.id) } },
});
console.log(`\n✓ Удалено аккаунтов: ${res.count}`);
await prisma.$disconnect();
