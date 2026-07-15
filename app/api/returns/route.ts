import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Client creates a return (works like placing an order; NOT pushed to 1С).
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    productId?: string;
    sku?: string;
    name?: string;
    qty?: number;
    reason?: string;
    comment?: string;
    warehouseName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (!body.productId && !body.sku) {
    return NextResponse.json({ error: "Укажите товар" }, { status: 400 });
  }

  // A return is only valid for something this client actually bought: the
  // snapshot (incl. the PRICE PAID, not today's catalog price) comes from the
  // client's own order lines, and the quantity is capped by the total bought.
  const itemWhere = {
    order: { userId: session.sub },
    isGift: false,
    ...(body.productId
      ? { productId: String(body.productId) }
      : { sku: String(body.sku) }),
  };
  const [bought, boughtTotal] = await Promise.all([
    prisma.orderItem.findFirst({
      where: itemWhere,
      orderBy: { order: { createdAt: "desc" } },
      include: { product: { select: { code: true, brand: true } } },
    }),
    prisma.orderItem.aggregate({ _sum: { qty: true }, where: itemWhere }),
  ]);
  if (!bought) {
    return NextResponse.json(
      { error: "Этот товар не найден в ваших заказах" },
      { status: 400 }
    );
  }

  const qty = Math.min(
    Math.max(1, Math.trunc(Number(body.qty) || 1)),
    boughtTotal._sum.qty ?? 1
  );
  const snap = {
    productId: bought.productId,
    code: bought.product?.code ?? null,
    sku: bought.sku,
    name: bought.name,
    brand: bought.product?.brand ?? null,
    price: Number(bought.price), // цена покупки из снимка заказа
  };

  const ret = await prisma.return.create({
    data: {
      userId: session.sub,
      productId: snap.productId,
      code: snap.code,
      sku: snap.sku,
      name: snap.name,
      brand: snap.brand,
      qty,
      price: snap.price,
      warehouseName: body.warehouseName?.trim() || null,
      reason: body.reason?.trim() || null,
      comment: body.comment?.trim() || null,
      status: "NEW",
    },
  });

  return NextResponse.json({ ok: true, id: ret.id });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const returns = await prisma.return.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    returns: returns.map((r) => ({
      id: r.id,
      code: r.code,
      sku: r.sku,
      name: r.name,
      qty: r.qty,
      price: Number(r.price),
      warehouseName: r.warehouseName,
      reason: r.reason,
      comment: r.comment,
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
}
