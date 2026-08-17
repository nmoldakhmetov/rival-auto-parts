import "server-only";
import { prisma } from "@/lib/prisma";

export const DEFAULTS: Record<string, string> = {
  blocked_message:
    "Ваш аккаунт временно заблокирован. Свяжитесь с вашим менеджером.",
  global_discount: "0",
  sync_cron: "*/30 * * * *",
  // Автоматизация: 0 = выключено.
  auto_block_days: "30", // автоблокировка клиента, чей долг старше N дней
  // Правила по бездействию. По умолчанию ВЫКЛЮЧЕНЫ: включать их за
  // заказчика нельзя — это молча снимает скидки и закрывает вход.
  idle_discount_days: "0", // снять личные скидки, если не заказывал N дней
  idle_block_days: "0", // заблокировать, если не заказывал N дней
  new_badge_days: "40", // сколько дней новый товар из 1С носит значок «новинка»
  price_drop_days: "13", // сколько дней держится скидка от снижения цены в 1С
  // Как показывать скидку на карточках: percent (−15%) или amount (−1 234 ₸).
  discount_display: "percent",
  // Подсказка при наведении на склад в карточке товара (правится в админке).
  warehouse_tooltip:
    "ЗАКАЗЫ ОФОРМЛЕННЫЕ ДО 11:30 ДОСТАВИМ ДО 18:00, ПОСЛЕ 11:30 ДОСТАВКА НА СЛЕДУЮЩИЙ ДЕНЬ.",
  // Kaspi Pay: токен устройства и торговая точка выдаются при подключении в
  // админке. Пусто = онлайн-оплата у клиентов не показывается. Ключ доступа
  // (Api-Key) здесь НЕ хранится — он только в переменных окружения сервера.
  kaspi_device_token: "",
  kaspi_trade_point: "",
  // Условия возврата в корзине: обычный заказ / заказ с подарком по акции.
  return_policy_default:
    "Возврат возможен при определенных условиях. Обратитесь к менеджеру для уточнения.",
  return_policy_gift:
    "При возврате основного товара возврат подарка обязателен.",
};

export async function getSetting(key: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? DEFAULTS[key] ?? "";
}

export async function getSettings(
  keys: string[]
): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  for (const k of keys) map[k] = DEFAULTS[k] ?? "";
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
