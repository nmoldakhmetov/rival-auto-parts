// Проверка Telegram-уведомлений: показывает, у кого из менеджеров заполнен
// Telegram ID, и по желанию шлёт тестовое сообщение.
//
//   node scripts/test-telegram.mjs                 → только проверка настроек
//   node scripts/test-telegram.mjs 123456789       → ещё и тест на этот chat_id
//
// Токен берётся из TELEGRAM_BOT_TOKEN (.env). Сам токен нигде не печатается.
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

const token = process.env.TELEGRAM_BOT_TOKEN;

// ─── 1. Менеджеры и их Telegram ID ──────────────────────────────────────────
try {
  const prisma = new PrismaClient();
  const managers = await prisma.user.findMany({
    where: { role: "MANAGER" },
    select: {
      login: true,
      fullName: true,
      telegramId: true,
      isActive: true,
      _count: { select: { clients: true } },
    },
    orderBy: { fullName: "asc" },
  });
  console.log("── МЕНЕДЖЕРЫ И TELEGRAM ID ──");
  let missing = 0;
  for (const m of managers) {
    if (!m.telegramId) missing++;
    console.log(
      `  ${m.telegramId ? "✓" : "✗"} ${m.login.padEnd(12)} ${m.fullName.padEnd(22).slice(0, 22)} ` +
        `${(m.telegramId ?? "ID НЕ ЗАПОЛНЕН").padEnd(18)} клиентов: ${m._count.clients}` +
        `${m.isActive ? "" : "  [заблокирован]"}`
    );
  }
  if (missing > 0) {
    console.log(
      `\n  ⚠ У ${missing} менеджер(ов) не заполнен Telegram ID — заказы их клиентов\n` +
        `    уйдут на запасной TELEGRAM_CHAT_ID (${process.env.TELEGRAM_CHAT_ID || "не задан"}),\n` +
        `    а если и он пуст — не уйдут вовсе.\n` +
        `    Заполнить: Админ-панель → Клиенты → «Менеджеры» → «Изменить» → Telegram ID.`
    );
  }
  console.log();
  await prisma.$disconnect();
} catch (e) {
  console.log("(не удалось прочитать менеджеров из базы:", e.message, ")\n");
}

// ─── 2. Токен ───────────────────────────────────────────────────────────────
if (!token) {
  console.error("✗ Не задан TELEGRAM_BOT_TOKEN в .env");
  console.error("  Получить: @BotFather → /mybots → выбрать бота → API Token.");
  console.error("  ⚠ После правки .env приложение нужно ПЕРЕЗАПУСТИТЬ.");
  process.exit(1);
}
if (!token.includes(":")) {
  console.error("✗ TELEGRAM_BOT_TOKEN похож на номер бота без секретной части.");
  console.error("  Нужен полный токен вида 8939451902:AAH… — номер сам по себе не подойдёт.");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
if (!res.ok) {
  console.error("✗ Telegram отклонил токен:", res.description);
  process.exit(1);
}
console.log(`✓ Бот: @${res.result.username} (${res.result.first_name}), id ${res.result.id}`);

// ─── 3. Тестовое сообщение ──────────────────────────────────────────────────
const chatId = process.argv[2];
if (!chatId) {
  console.log("\nЧтобы проверить доставку, передайте chat_id:");
  console.log("  node scripts/test-telegram.mjs 123456789");
  process.exit(0);
}

const send = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    text: "🔧 Проверка связи с порталом Rival Auto.\nЕсли вы это видите — уведомления о заказах будут приходить сюда.",
  }),
}).then((r) => r.json());

if (send.ok) {
  console.log(`✓ Тестовое сообщение отправлено в чат ${chatId}`);
} else {
  console.error(`✗ Не отправлено: ${send.description}`);
  if (/chat not found/i.test(send.description ?? "")) {
    console.error(
      "  Либо ID неверный, либо менеджер ещё не нажимал «Start» у бота —\n" +
        "  Telegram запрещает боту писать пользователю первым."
    );
  }
  process.exit(1);
}
