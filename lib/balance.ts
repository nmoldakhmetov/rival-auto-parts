import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma, OrderStatus } from "@prisma/client";

// Долг возникает не в момент оформления, а когда заказ ВЗЯЛИ В РАБОТУ:
// свежая заявка («Заказ принят») ещё может не подтвердиться, и вешать её на
// баланс клиента рано. Дальше долг живёт до оплаты — товар уже выдан или
// заказан под клиента.
//
//   «В работе» · «Выдано» · «Выполнен»   → долг считается
//   «Заказ принят» · «Отправлен» · «Нет в наличии» · «Отказ клиента» → нет
//
// Список один на всё приложение: по нему считается и баланс клиента, и
// колонка «Долг» в разделе «Заказы», иначе они начнут расходиться.
export const DEBT_STATUSES: OrderStatus[] = [
  "PROCESSING",
  "ISSUED",
  "COMPLETED",
];

export function countsAsDebt(status: OrderStatus): boolean {
  return DEBT_STATUSES.includes(status);
}

// Баланс клиента считается по формуле, а не копится приращениями:
//
//     balance = Σ (total − paid) по заказам клиента в долговых статусах
//
// Положительное значение = ДОЛГ (так же трактует его карточка клиента в
// админке). Долг висит до тех пор, пока админ или бухгалтер не изменит
// «оплачено» в разделе «Заказы» — единственный рычаг, который его двигает.
//
// Раньше долг прибавлялся один раз при переводе заказа в «Выдано» (флаг
// `Order.debtApplied`), поэтому баланс расходился с реальностью: новые заказы
// в долг не попадали, а правка «оплачено» после выдачи его не уменьшала.
// Пересчёт по формуле самовосстанавливающийся — любая правка суммы, оплаты
// или статуса приводит баланс в соответствие с заказами.

// Prisma-клиент или транзакция: пересчёт обязан идти в той же транзакции,
// что и правка заказа, иначе между ними видно несогласованное состояние.
type Db = Prisma.TransactionClient | typeof prisma;

export async function recalcUserBalance(
  userId: string,
  db: Db = prisma
): Promise<number> {
  const agg = await db.order.aggregate({
    where: { userId, status: { in: DEBT_STATUSES } },
    _sum: { total: true, paid: true },
  });
  const balance =
    Number(agg._sum.total ?? 0) - Number(agg._sum.paid ?? 0);
  await db.user.update({ where: { id: userId }, data: { balance } });
  return balance;
}
