import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Баланс клиента считается по формуле, а не копится приращениями:
//
//     balance = Σ (total − paid) по всем заказам клиента, кроме отменённых
//
// Положительное значение = ДОЛГ (так же трактует его карточка клиента в
// админке). Долг появляется в момент оформления заказа и висит до тех пор,
// пока админ или бухгалтер не изменит «оплачено» в разделе «Заказы» —
// единственный рычаг, который двигает баланс.
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
    where: { userId, status: { not: "CANCELLED" } },
    _sum: { total: true, paid: true },
  });
  const balance =
    Number(agg._sum.total ?? 0) - Number(agg._sum.paid ?? 0);
  await db.user.update({ where: { id: userId }, data: { balance } });
  return balance;
}
