import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";
import { recalcUserBalance } from "@/lib/balance";

export const dynamic = "force-dynamic";

// Тот же потолок, что в корзине и при оформлении.
const MAX_QTY = 100_000;

// PATCH /api/admin/orders/[id]/items — правка количества в оформленном заказе.
//
// Зачем: остаток в 1С бывает неактуальным, и часть позиции физически нечем
// отгрузить. Менеджер уменьшает количество (0 = позицию не отгружаем вовсе),
// сумма заказа и долг клиента пересчитываются, а клиент видит правку в
// «Моих заказах»: старое количество зачёркнуто, рядом новое, плюс пояснение.
//
// Исходное количество сохраняется в OrderItem.qtyOriginal ОДИН раз — при
// первой правке, чтобы клиент всегда видел, что он заказывал сам, а не
// промежуточное значение после нескольких правок.
//
// Подарки пересчитывать не пытаемся: правило «за N штук — подарок» считалось
// при оформлении, и решение, оставлять ли подарок после урезания заказа, —
// за менеджером (строку подарка он может поправить так же руками).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Бухгалтер в заказах правит только оплату, состав — нет.
  if (session.role === "ACCOUNTANT" || session.role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { items?: { id: string; qty: number }[]; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const incoming = Array.isArray(body.items) ? body.items : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "Нечего изменять" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  if (!(await managerOwnsClient(session, order.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const byId = new Map(order.items.map((i) => [i.id, i]));
  const updates: { id: string; qty: number; qtyOriginal: number | null }[] = [];
  for (const raw of incoming) {
    const item = byId.get(String(raw.id));
    if (!item) continue;
    const qty = Math.min(MAX_QTY, Math.max(0, Math.trunc(Number(raw.qty))));
    if (!Number.isFinite(qty) || qty === item.qty) continue;
    updates.push({
      id: item.id,
      qty,
      // Запоминаем исходное количество только в первую правку.
      qtyOriginal: item.qtyOriginal ?? item.qty,
    });
  }

  if (updates.length === 0) {
    return NextResponse.json(
      { error: "Количество не изменилось" },
      { status: 400 }
    );
  }

  const note = (body.note ?? "").trim().slice(0, 500) || null;

  const result = await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.orderItem.update({
        where: { id: u.id },
        data: { qty: u.qty, qtyOriginal: u.qtyOriginal },
      });
    }
    // Сумма заказа = сумма строк после правки (подарки идут по нулю).
    const items = await tx.orderItem.findMany({
      where: { orderId: order.id },
      select: { price: true, qty: true },
    });
    const total = items.reduce((s, i) => s + Number(i.price) * i.qty, 0);
    await tx.order.update({
      where: { id: order.id },
      data: {
        total,
        editedAt: new Date(),
        // Пустое сообщение прежнее не затирает — менеджер мог просто
        // поправить количество ещё раз.
        ...(note ? { editNote: note } : {}),
        // Клиент правку ещё не видел.
        editSeenAt: null,
      },
    });
    // Долг клиента считается от суммы заказа — пересчитываем в той же
    // транзакции (см. lib/balance.ts).
    const balance = await recalcUserBalance(order.userId, tx);
    return { total, balance };
  });

  console.log(
    `[order] Заказ №${order.id.slice(-6).toUpperCase()}: состав изменён пользователем «${session.login}» — строк ${updates.length}, сумма ${result.total}`
  );

  return NextResponse.json({
    ok: true,
    total: result.total,
    balance: result.balance,
    changed: updates.length,
  });
}
