import { NextRequest, NextResponse } from "next/server";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";

export const dynamic = "force-dynamic";

const STATUSES = new Set<string>([
  "NEW",
  "SENT",
  "PROCESSING",
  "OUT_OF_STOCK",
  "ISSUED",
  "COMPLETED",
  "CANCELLED",
]);

// GET: full order contents — what the client actually bought. Item rows are
// snapshots taken at order time (sku/name/price), so they stay correct even
// after a 1С sync changes the catalog. Managers may only open their own
// clients' orders.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items: {
        orderBy: [{ isGift: "asc" }, { sku: "asc" }],
        // Photo + id come from the live product (null if it was removed from
        // the catalog since); the textual fields stay order-time snapshots.
        include: { product: { select: { id: true, imageUrl: true } } },
      },
      user: {
        select: {
          fullName: true,
          login: true,
          email: true,
          phone: true,
          address: true,
        },
      },
    },
  });
  if (!order) {
    return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
  }
  if (!(await managerOwnsClient(session, order.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    order: {
      id: order.id,
      orderNo: order.id.slice(-6).toUpperCase(),
      createdAt: order.createdAt,
      status: order.status,
      total: Number(order.total),
      paid: Number(order.paid),
      comment: order.comment,
      onecSent: order.onecSent,
      onecNumber: order.onecNumber,
      client: order.user,
      items: order.items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        price: Number(i.price),
        qty: i.qty,
        isGift: i.isGift,
        productId: i.product?.id ?? null,
        imageUrl: i.product?.imageUrl ?? null,
      })),
    },
  });
}

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
