import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { recalcUserBalance } from "@/lib/balance";
import { KaspiError, isFinalStatus, paymentStatus } from "@/lib/kaspi";
import type { KaspiPaymentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

// Статус попытки оплаты. Экран оплаты дёргает этот роут с интервалом, который
// вернул Kaspi при создании покупки, до конечного статуса.
//
// Деньги считаются полученными ТОЛЬКО здесь: Kaspi спрашиваем сами, клиенту
// на слово не верим. Успех проводится один раз — повторный опрос уже
// завершённого платежа ничего не начисляет.

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payment = await prisma.kaspiPayment.findUnique({
    where: { id: params.id },
    include: {
      order: { select: { id: true, userId: true, total: true, paid: true } },
    },
  });
  if (!payment || payment.order.userId !== session.sub) {
    return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });
  }

  // Конечный статус уже зафиксирован — в Kaspi ходить незачем.
  if (isFinalStatus(payment.status as KaspiPaymentStatus)) {
    return NextResponse.json({
      status: payment.status,
      paid: payment.status === "Processed",
      transactionId: payment.transactionId,
      error: payment.error,
    });
  }

  let info;
  try {
    info = await paymentStatus(payment.kaspiPaymentId);
  } catch (e) {
    // Разрыв связи не отменяет покупку: отвечаем прежним статусом, экран
    // продолжит опрашивать.
    console.warn("[kaspi] статус:", e instanceof Error ? e.message : e);
    return NextResponse.json({
      status: payment.status,
      paid: false,
      pending: true,
      error: e instanceof KaspiError ? e.message : null,
    });
  }

  const status = info.status as KaspiPaymentStatus;

  if (status === "Processed" && payment.status !== "Processed") {
    // Оплата прошла: гасим долг по заказу и пересчитываем баланс клиента в
    // одной транзакции — иначе между ними видно несогласованное состояние.
    const paidNow = Number(payment.amount);
    await prisma.$transaction(async (tx) => {
      await tx.kaspiPayment.update({
        where: { id: payment.id },
        data: {
          status,
          transactionId: info.transactionId,
          productType: info.productType,
          error: null,
        },
      });
      const order = await tx.order.update({
        where: { id: payment.orderId },
        data: { paid: { increment: paidNow } },
        select: { userId: true },
      });
      await recalcUserBalance(order.userId, tx);
    });
    return NextResponse.json({
      status,
      paid: true,
      transactionId: info.transactionId,
    });
  }

  if (status !== payment.status) {
    await prisma.kaspiPayment.update({
      where: { id: payment.id },
      data: {
        status,
        error: status === "Error" ? "Оплата не завершена" : null,
      },
    });
  }

  return NextResponse.json({
    status,
    paid: false,
    error: status === "Error" ? "Оплата не завершена" : null,
  });
}
