// Sets a user's password. The password is typed interactively and never
// appears in the shell history, in the repo, or in any log — only its bcrypt
// hash is written to the database (User.passwordHash).
//
//   Локальная база:
//     node scripts/set-password.mjs admin
//
//   Прод (Neon) — подставьте строку подключения из Vercel → Settings →
//   Environment Variables → DATABASE_URL:
//     PowerShell:  $env:DATABASE_URL="postgres://…"; node scripts/set-password.mjs admin
//     bash:        DATABASE_URL="postgres://…" node scripts/set-password.mjs admin
//
// DATABASE_URL из окружения имеет приоритет над .env.
import { readFileSync } from "node:fs";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const MIN_LENGTH = 10;
const BCRYPT_ROUNDS = 10; // must match lib/auth.ts

try {
  const envFile = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  // No .env — rely on the environment (that is the prod flow).
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    if (hidden) {
      // Echo the prompt, swallow every typed character.
      rl._writeToOutput = (str) => {
        if (str.startsWith(question)) rl.output.write(str);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const login = process.argv[2];
if (!login) {
  console.error("Использование: node scripts/set-password.mjs <логин>");
  process.exit(1);
}

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({
  where: { login },
  select: { id: true, login: true, role: true, fullName: true },
});
if (!user) {
  console.error(`Пользователь «${login}» не найден.`);
  await prisma.$disconnect();
  process.exit(1);
}

const host = (process.env.DATABASE_URL ?? "").match(/@([^/?]+)/)?.[1] ?? "?";
console.log(`База:         ${host}`);
console.log(`Пользователь: ${user.login} (${user.role}) — ${user.fullName}`);

const pw = await ask("Новый пароль: ", { hidden: true });
if (pw.length < MIN_LENGTH) {
  console.error(`Пароль слишком короткий (минимум ${MIN_LENGTH} символов).`);
  await prisma.$disconnect();
  process.exit(1);
}
const confirm = await ask("Повторите пароль: ", { hidden: true });
if (pw !== confirm) {
  console.error("Пароли не совпадают — ничего не изменено.");
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash: bcrypt.hashSync(pw, BCRYPT_ROUNDS) },
});
console.log(`✓ Пароль пользователя «${user.login}» обновлён (bcrypt).`);
await prisma.$disconnect();
