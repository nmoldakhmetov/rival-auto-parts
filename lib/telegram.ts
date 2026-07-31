import "server-only";
import { formatTenge } from "@/lib/format";
import {
  PAYMENT_LABELS,
  DELIVERY_LABELS,
  type PaymentMethod,
  type DeliveryMethod,
} from "@/lib/order-options";

// Уведомление менеджеру о новом заказе в Telegram.
//
// Настройка:
//   TELEGRAM_BOT_TOKEN — полный токен из @BotFather вида «8939451902:AAH…».
//                        Одного номера бота недостаточно: часть после
//                        двоеточия — секрет, которым подписываются запросы.
//   TELEGRAM_CHAT_ID   — запасной чат (необязательно): туда уходят заказы
//                        клиентов, у чьего менеджера не заполнен Telegram ID.
//
// У каждого менеджера в админке заполняется его числовой Telegram ID
// (узнаётся через @userinfobot). Менеджер ОБЯЗАН сам нажать «Start» у бота —
// Telegram не позволяет боту написать пользователю первым.
//
// Отправка best-effort: сбой Telegram не должен ломать оформление заказа.

export type TelegramOrderItem = {
  sku: string;
  name: string;
  qty: number;
  price: number;
  isGift: boolean;
  warehouses: string[];
};

export type TelegramOrderData = {
  orderNo: string;
  total: number;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  comment: string | null;
  client: {
    fullName: string;
    login: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    address: string | null;
  };
  manager: { fullName: string; telegramId: string | null } | null;
};

const MAX_LEN = 4096; // жёсткий лимит длины сообщения в Telegram

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildOrderMessage(
  d: TelegramOrderData,
  items: TelegramOrderItem[]
): string {
  const pickup = d.deliveryMethod === "PICKUP";
  const fullAddress = [d.client.city, d.client.address]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const lines: string[] = [];
  lines.push(`🧾 <b>Новый заказ №${esc(d.orderNo)}</b>`);
  lines.push("");
  lines.push("<b>Клиент</b>");
  lines.push(`ФИО: ${esc(d.client.fullName)}`);
  lines.push(`Логин: ${esc(d.client.login)}`);
  lines.push(`Телефон: ${esc(d.client.phone || "не указан")}`);
  lines.push(`Почта: ${esc(d.client.email || "не указана")}`);
  lines.push("");
  lines.push(`Оплата: <b>${esc(PAYMENT_LABELS[d.paymentMethod])}</b>`);
  lines.push(`Доставка: <b>${esc(DELIVERY_LABELS[d.deliveryMethod])}</b>`);
  if (!pickup) lines.push(`Адрес: ${esc(fullAddress || "не указан")}`);
  if (d.comment) lines.push(`Комментарий: ${esc(d.comment)}`);
  lines.push("");
  lines.push("<b>Состав заказа</b>");

  // Позиции добавляем по одной, чтобы не выйти за лимит сообщения.
  const footer = (shown: number) =>
    (shown < items.length ? `…и ещё ${items.length - shown} поз.\n` : "") +
    `\n<b>Итого: ${esc(formatTenge(d.total))}</b>`;

  let shown = 0;
  let body = "";
  for (const i of items) {
    const stock = i.warehouses.length
      ? `в наличии (${i.warehouses.join(", ")})`
      : "под заказ";
    const price = i.isGift ? "подарок" : formatTenge(i.price * i.qty);
    const row = `${shown + 1}. <b>${esc(i.sku)}</b> — ${esc(i.name)}\n     ${i.qty} шт · ${esc(stock)} · ${esc(price)}\n`;
    if (lines.join("\n").length + body.length + row.length + footer(shown + 1).length > MAX_LEN) {
      break;
    }
    body += row;
    shown++;
  }

  return lines.join("\n") + "\n" + body + footer(shown);
}

export async function sendOrderTelegram(
  d: TelegramOrderData,
  items: TelegramOrderItem[]
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, skipped: true, error: "TELEGRAM_BOT_TOKEN не задан" };
  }
  if (!token.includes(":")) {
    return {
      ok: false,
      error:
        "TELEGRAM_BOT_TOKEN похож на номер бота без секретной части — нужен полный токен из @BotFather (вида 8939451902:AAH…)",
    };
  }

  const chatId = d.manager?.telegramId?.trim() || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    return {
      ok: false,
      skipped: true,
      error: d.manager
        ? `у менеджера «${d.manager.fullName}» не заполнен Telegram ID`
        : "за клиентом не закреплён менеджер",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildOrderMessage(d, items),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!res.ok || !data.ok) {
      let hint = data.description ?? `HTTP ${res.status}`;
      if (/chat not found/i.test(hint)) {
        hint += " — проверьте Telegram ID и то, что менеджер нажал «Start» у бота";
      } else if (/bot was blocked/i.test(hint)) {
        hint += " — менеджер заблокировал бота";
      } else if (/unauthorized/i.test(hint)) {
        hint += " — неверный TELEGRAM_BOT_TOKEN";
      }
      return { ok: false, error: hint };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
