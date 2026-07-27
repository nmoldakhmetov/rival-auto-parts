// Lists the accounts in a database — logins, roles, activity flags. Никаких
// паролей и хэшей не печатает. Нужен, чтобы понять состояние конкретной
// инсталляции (например, почему не пускает вход: аккаунта нет или пароль
// другой).
//
//   node scripts/list-users.mjs
//
// Для другой базы подставьте строку подключения:
//   PowerShell:  $env:DATABASE_URL="postgres://…"; node scripts/list-users.mjs
//   bash:        DATABASE_URL="postgres://…" node scripts/list-users.mjs
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

const prisma = new PrismaClient();
const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "?";
console.log(`База: ${host}\n`);

const users = await prisma.user.findMany({
  select: {
    login: true,
    role: true,
    fullName: true,
    isActive: true,
    createdAt: true,
  },
  orderBy: [{ role: "asc" }, { login: "asc" }],
});

if (users.length === 0) {
  console.log("⚠ В базе НЕТ НИ ОДНОГО пользователя.");
  console.log("  Вход невозможен, пока не создан администратор:");
  console.log("    node prisma/seed.mjs");
} else {
  console.log(`Всего аккаунтов: ${users.length}\n`);
  for (const u of users) {
    const when = u.createdAt.toISOString().slice(0, 10);
    console.log(
      `  ${u.login.padEnd(14)} ${u.role.padEnd(10)} ` +
        `${u.isActive ? "активен  " : "заблокир."} ${when}  ${u.fullName}`
    );
  }
  const products = await prisma.product.count();
  console.log(`\nТоваров в каталоге: ${products}`);
}

await prisma.$disconnect();
