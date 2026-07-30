// Проверка почтовых настроек: отправляет тестовое письмо, не создавая заказ.
//
//   node scripts/test-mail.mjs                 → на ORDER_MAIL_TO
//   node scripts/test-mail.mjs kto@to.kz       → на указанный адрес
//
// Ничего не печатает из пароля. Настройки берутся из .env / .env.local
// (переменные окружения имеют приоритет).
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

for (const f of ["../.env", "../.env.local"]) {
  try {
    const envFile = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // файла нет — берём из окружения
  }
}

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;
const to = process.argv[2] || process.env.ORDER_MAIL_TO || user;

// ─── 1. Кому вообще уйдут письма о заказах ──────────────────────────────────
// Письмо адресуется менеджеру клиента. Если у менеджера пустой e-mail, письма
// по его клиентам уходить не будут (или свалятся на запасной ORDER_MAIL_TO).
try {
  const prisma = new PrismaClient();
  const managers = await prisma.user.findMany({
    where: { role: "MANAGER" },
    select: { login: true, fullName: true, email: true, isActive: true, _count: { select: { clients: true } } },
    orderBy: { fullName: "asc" },
  });
  console.log("── МЕНЕДЖЕРЫ И ИХ ПОЧТА ──");
  let noEmail = 0;
  for (const m of managers) {
    if (!m.email) noEmail++;
    console.log(
      `  ${m.email ? "✓" : "✗"} ${m.login.padEnd(12)} ${m.fullName.padEnd(22).slice(0, 22)} ` +
        `${(m.email ?? "ПОЧТА НЕ ЗАПОЛНЕНА").padEnd(30)} клиентов: ${m._count.clients}` +
        `${m.isActive ? "" : "  [заблокирован]"}`
    );
  }
  if (noEmail > 0) {
    console.log(
      `\n  ⚠ У ${noEmail} менеджер(ов) не заполнен e-mail — письма по их клиентам\n` +
        `    уйдут на запасной ORDER_MAIL_TO (${process.env.ORDER_MAIL_TO || "не задан"}),\n` +
        `    а если и он пуст — не уйдут вовсе.\n` +
        `    Заполнить: Админ-панель → Клиенты → вкладка «Менеджеры» → «Изменить».`
    );
  }
  const orphans = await prisma.user.count({ where: { role: "CLIENT", managerId: null } });
  if (orphans > 0) {
    console.log(`\n  ⚠ Клиентов без менеджера: ${orphans} — их заказы тоже уйдут на ORDER_MAIL_TO.`);
  }
  console.log();
  await prisma.$disconnect();
} catch (e) {
  console.log("(не удалось проверить менеджеров в базе:", e.message, ")\n");
}

// ─── 2. Настройки SMTP ──────────────────────────────────────────────────────
if (!user || !pass) {
  console.error("✗ Не заданы SMTP_USER / SMTP_PASSWORD в .env");
  console.error("  Нужен «пароль приложения» Google, а не обычный пароль почты.");
  console.error("  ⚠ После правки .env приложение нужно ПЕРЕЗАПУСТИТЬ —");
  console.error("    работающий процесс старые переменные окружения не перечитывает.");
  process.exit(1);
}

const port = parseInt(process.env.SMTP_PORT ?? "465", 10) || 465;
console.log(`Сервер:    ${process.env.SMTP_HOST || "smtp.gmail.com"}:${port}`);
console.log(`Ящик:      ${user}`);
console.log(`Пароль:    задан (${pass.replace(/\s/g, "").length} символов)`);
console.log(`Кому:      ${to}\n`);

if (pass.replace(/\s/g, "").length !== 16) {
  console.warn(
    "⚠ Пароль приложения Google обычно ровно 16 символов. Если это обычный\n" +
      "  пароль от почты — Google откажет: с 2022 года SMTP по нему не работает.\n"
  );
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port,
  secure: port === 465,
  auth: { user, pass },
});

try {
  await transporter.verify();
  console.log("✓ Подключение и авторизация прошли");
} catch (e) {
  console.error("✗ Не удалось авторизоваться:", e.message);
  if (/Username and Password not accepted|BadCredentials|535/i.test(e.message)) {
    console.error(
      "\n  Google отклонил пару логин/пароль. Почти всегда причина одна:\n" +
        "  используется обычный пароль вместо пароля приложения.\n" +
        "  Google Аккаунт → Безопасность → Двухэтапная аутентификация (включить)\n" +
        "  → Пароли приложений → создать → вставить 16 символов в SMTP_PASSWORD."
    );
  }
  process.exit(1);
}

try {
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || user,
    to,
    subject: "Проверка почты — портал Rival Auto",
    text:
      "Это тестовое письмо с портала Rival Auto.\n" +
      "Если оно пришло — уведомления о заказах менеджерам будут работать.",
  });
  console.log("✓ Письмо отправлено, id:", info.messageId);
  console.log("  Проверьте входящие (и папку «Спам») на", to);
} catch (e) {
  console.error("✗ Ошибка отправки:", e.message);
  process.exit(1);
}
