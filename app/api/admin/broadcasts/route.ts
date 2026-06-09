import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Access restricted to ADMIN by middleware (/api/admin/*).

// GET — all broadcasts (newest first) with products + read stats.
export async function GET() {
  const broadcasts = await prisma.broadcast.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      products: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              fullName: true,
              price: true,
              imageUrl: true,
              badge: true,
            },
          },
        },
      },
      recipients: { select: { userId: true, readAt: true } },
    },
  });

  return NextResponse.json({
    broadcasts: broadcasts.map((b) => ({
      id: b.id,
      title: b.title,
      text: b.text,
      isGlobal: b.isGlobal,
      createdAt: b.createdAt,
      products: b.products
        .filter((bp) => bp.product)
        .map((bp) => ({
          id: bp.product.id,
          sku: bp.product.sku,
          name: bp.product.name,
          fullName: bp.product.fullName,
          price: Number(bp.product.price),
          imageUrl: bp.product.imageUrl,
          badge: bp.product.badge,
        })),
      recipientCount: b.isGlobal ? null : b.recipients.length,
      readCount: b.recipients.filter((r) => r.readAt).length,
      recipientIds: b.recipients.map((r) => r.userId),
    })),
  });
}

// POST — create a broadcast.
export async function POST(req: NextRequest) {
  let body: {
    title?: string;
    text?: string;
    productIds?: string[];
    isGlobal?: boolean;
    userIds?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Введите текст рассылки" },
      { status: 400 }
    );
  }

  const isGlobal = !!body.isGlobal;
  const productIds = [...new Set((body.productIds ?? []).filter(Boolean))];
  const userIds = isGlobal
    ? []
    : [...new Set((body.userIds ?? []).filter(Boolean))];

  if (!isGlobal && userIds.length === 0) {
    return NextResponse.json(
      { error: "Выберите получателей или включите «всем клиентам»" },
      { status: 400 }
    );
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      title: body.title?.trim() || null,
      text,
      isGlobal,
      products: { create: productIds.map((productId) => ({ productId })) },
      recipients: { create: userIds.map((userId) => ({ userId })) },
    },
  });

  return NextResponse.json({ ok: true, id: broadcast.id });
}
