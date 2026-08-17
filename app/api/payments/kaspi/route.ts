import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import {
  KaspiError,
  createPayment,
  kaspiReady,
} from "@/lib/kaspi";

export const dynamic = "force-dynamic";

// Начало онлайн-оплаты заказа через Kaspi Pay.
//
// GET  → готова ли оплата вообще (корзина по этому флагу показывает способ).
// POST { orderId, mode } → создаёт покупку в Kaspi и возвращает QR/ссылку.
//
// Платит ТОЛЬКО клиент и только за свой заказ: сумма берётся из заказа на
// сервере, из тела запроса она не принимается — иначе можно было бы оплатить
// 100 000 ₸ заказ сотней тенге.

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ready: await kaspiReady() });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Оплачивают заказы только клиенты" },
      { status: 403 }
    );
  }

  let body: { orderId?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const orderId = String(body.orderId ?? "");
  // На телефоне ссылка открывает приложение Kaspi, на десктопе показываем QR.
  // Режим выбирает клиент, потому что каждый вызов создаёт свою покупку.
  const mode = body.mode === "qr" ? "qr" : "link";

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, total: true, paid: true, status: true },
  });
  if (!order || order.userId !== session.sub) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  if (order.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Заказ отменён — оплата невозможна" },
      { status: 409 }
    );
  }

  const due = Number(order.total) - Number(order.paid);
  if (due <= 0) {
    return NextResponse.json({ error: "Заказ уже оплачен" }, { status: 409 });
  }

  if (!(await kaspiReady())) {
    return NextResponse.json(
      { error: "Оплата через Kaspi сейчас недоступна" },
      { status: 503 }
    );
  }

  // Одна попытка — одна покупка в Kaspi. Если по заказу уже начата живая
  // оплата того же вида, отдаём её, а не создаём вторую: иначе на один заказ
  // в Kaspi висело бы несколько покупок на одну сумму (двойной клик,
  // обновление страницы, повторный монтаж экрана — всё это бывает).
  const active = await prisma.kaspiPayment.findFirst({
    where: {
      orderId: order.id,
      mode,
      status: { in: ["QrTokenCreated", "Wait"] },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  if (active) {
    return NextResponse.json({
      id: active.id,
      mode: active.mode,
      amount: Number(active.amount),
      qrToken: active.qrToken,
      paymentLink: active.paymentLink,
      expiresAt: active.expiresAt,
      paymentMethods: [],
      // Тайминги живут в самой покупке Kaspi; для продолжения хватает
      // интервала опроса и остатка времени до expiresAt.
      pollingInterval: 5,
      activationTimeout: active.expiresAt
        ? Math.max(
            5,
            Math.round((active.expiresAt.getTime() - Date.now()) / 1000)
          )
        : 180,
      confirmationTimeout: 65,
      reused: true,
    });
  }

  // Протухшие незавершённые попытки закрываем: клиент начинает заново.
  await prisma.kaspiPayment.updateMany({
    where: { orderId: order.id, status: { in: ["QrTokenCreated", "Wait"] } },
    data: { status: "Error", error: "Истёк срок действия" },
  });

  try {
    const created = await createPayment(mode, due, order.id.slice(-12));
    const payment = await prisma.kaspiPayment.create({
      data: {
        orderId: order.id,
        userId: session.sub,
        kaspiPaymentId: created.paymentId,
        mode,
        amount: due,
        status: "QrTokenCreated",
        qrToken: created.qrToken ?? null,
        paymentLink: created.paymentLink ?? null,
        expiresAt: created.expireDate ? new Date(created.expireDate) : null,
      },
    });

    return NextResponse.json({
      id: payment.id,
      mode,
      amount: due,
      qrToken: created.qrToken ?? null,
      paymentLink: created.paymentLink ?? null,
      expiresAt: payment.expiresAt,
      paymentMethods: created.paymentMethods,
      // Тайминги Kaspi: по ним экран оплаты опрашивает статус и показывает,
      // сколько осталось времени.
      pollingInterval: created.statusPollingInterval,
      activationTimeout: created.activationTimeout,
      confirmationTimeout: created.confirmationTimeout,
    });
  } catch (e) {
    const msg =
      e instanceof KaspiError ? e.message : "Не удалось начать оплату";
    console.warn(
      "[kaspi] создание платежа:",
      e instanceof Error ? e.message : e
    );
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
