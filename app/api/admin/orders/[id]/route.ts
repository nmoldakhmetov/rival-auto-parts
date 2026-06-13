import { NextRequest, NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";

const STATUSES = new Set<string>([
  "NEW",
  "SENT",
  "PROCESSING",
  "OUT_OF_STOCK",
  "ISSUED",
  "COMPLETED",
  "CANCELLED",
]);

// PATCH: change status / paid amount. When an order is ISSUED, its outstanding
// debt is credited to the client's balance (once).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { status?: string; paid?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const session = await getSession();
  const order = await prisma.order.findUnique({ where: { id: params.id } });
  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  if (session && !(await managerOwnsClient(session, order.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: { status?: OrderStatus; paid?: number } = {};
  if (body.status && STATUSES.has(body.status)) {
    data.status = body.status as OrderStatus;
  }
  if (body.paid !== undefined) {
    const p = Number(body.paid);
    if (Number.isFinite(p) && p >= 0) data.paid = p;
  }

  const newStatus = data.status ?? order.status;
  const newPaid = data.paid ?? Number(order.paid);
  const debt = Number(order.total) - newPaid;
  const shouldApplyDebt =
    newStatus === "ISSUED" && !order.debtApplied && debt > 0;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { ...data, ...(shouldApplyDebt ? { debtApplied: true } : {}) },
    });
    if (shouldApplyDebt) {
      await tx.user.update({
        where: { id: order.userId },
        data: { balance: { increment: debt } },
      });
    }
  });

  return NextResponse.json({ ok: true, debtApplied: shouldApplyDebt });
}
