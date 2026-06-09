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

  const qty = Math.max(1, Math.trunc(Number(body.qty) || 1));

  let snap = {
    productId: null as string | null,
    code: null as string | null,
    sku: "",
    name: "",
    brand: null as string | null,
    price: 0,
  };

  if (body.productId) {
    const p = await prisma.product.findUnique({ where: { id: body.productId } });
    if (p) {
      snap = {
        productId: p.id,
        code: p.code,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        price: Number(p.price),
      };
    }
  } else if (body.sku) {
    const p = await prisma.product.findFirst({ where: { sku: body.sku } });
    if (p) {
      snap = {
        productId: p.id,
        code: p.code,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        price: Number(p.price),
      };
    } else {
      snap.sku = String(body.sku);
      snap.name = String(body.name ?? body.sku);
    }
  }

  if (!snap.sku) {
    return NextResponse.json({ error: "Укажите товар" }, { status: 400 });
  }

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
