import "server-only";
import { prisma } from "@/lib/prisma";

// Адреса доставки клиента.
//
// У оптовика их обычно несколько (склад, офис, точка выдачи), поэтому адрес
// перестал быть одним полем карточки: клиент выбирает нужный при оформлении,
// и именно выбранный уходит в 1С. Список ведёт персонал в карточке клиента.

export type AddressLite = {
  id: string;
  label: string | null;
  city: string | null;
  address: string;
  isDefault: boolean;
};

// Одна строка адреса для 1С, письма и снимка в заказе:
// «Казахстан, Алматы, Жибек жолы 11».
export function formatAddress(a: {
  city?: string | null;
  address?: string | null;
}): string {
  return [a.city, a.address]
    .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ");
}

// Список адресов клиента: основной первым, дальше по времени добавления.
export async function addressesOf(userId: string): Promise<AddressLite[]> {
  const rows = await prisma.clientAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      city: true,
      address: true,
      isDefault: true,
    },
  });
  return rows;
}

// Основной адрес может быть только один: перед назначением снимаем флаг
// с остальных. Вызывается внутри транзакции вместе с записью адреса.
export async function clearDefaults(
  userId: string,
  exceptId?: string,
  db: {
    clientAddress: { updateMany: typeof prisma.clientAddress.updateMany };
  } = prisma
): Promise<void> {
  await db.clientAddress.updateMany({
    where: {
      userId,
      isDefault: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { isDefault: false },
  });
}
