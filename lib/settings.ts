import "server-only";
import { prisma } from "@/lib/prisma";

export const DEFAULTS: Record<string, string> = {
  blocked_message:
    "Ваш аккаунт временно заблокирован. Свяжитесь с вашим менеджером.",
  global_discount: "0",
  sync_cron: "*/30 * * * *",
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
