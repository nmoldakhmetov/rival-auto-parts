import "server-only";
import { prisma } from "@/lib/prisma";

export const DEFAULTS: Record<string, string> = {
  blocked_message:
    "Ваш аккаунт временно заблокирован. Свяжитесь с вашим менеджером.",
  global_discount: "0",
  sync_cron: "*/30 * * * *",
  // Автоматизация: 0 = выключено.
  auto_block_days: "30", // автоблокировка клиента, чей долг старше N дней
  new_badge_days: "40", // сколько дней новый товар из 1С носит значок «новинка»
  price_drop_days: "13", // сколько дней держится скидка от снижения цены в 1С
  // Как показывать скидку на карточках: percent (−15%) или amount (−1 234 ₸).
  discount_display: "percent",
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
