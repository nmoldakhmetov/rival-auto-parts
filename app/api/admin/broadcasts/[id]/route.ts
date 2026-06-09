import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Access restricted to ADMIN by middleware (/api/admin/*).

// PATCH — edit a broadcast (title/text/products/recipients).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const data: Prisma.BroadcastUpdateInput = {};
  if (typeof body.title === "string") data.title = body.title.trim() || null;
  if (typeof body.text === "string") {
    const t = body.text.trim();
    if (!t) {
      return NextResponse.json(
        { error: "Текст не может быть пустым" },
        { status: 400 }
      );
    }
    data.text = t;
  }

  const isGlobal =
    typeof body.isGlobal === "boolean" ? body.isGlobal : undefined;
  if (isGlobal !== undefined) data.isGlobal = isGlobal;

  // Replace product links if provided.
  if (Array.isArray(body.productIds)) {
    const productIds = [...new Set(body.productIds.filter(Boolean))];
    data.products = {
      deleteMany: {},
      create: productIds.map((productId) => ({ productId })),
    };
  }

  // Replace recipients if provided (resets read status for the new set).
  if (Array.isArray(body.userIds) || isGlobal !== undefined) {
    if (isGlobal === true) {
      data.recipients = { deleteMany: {} };
    } else if (Array.isArray(body.userIds)) {
      const userIds = [...new Set(body.userIds.filter(Boolean))];
      data.recipients = {
        deleteMany: {},
        create: userIds.map((userId) => ({ userId })),
      };
    }
  }

  try {
    await prisma.broadcast.update({ where: { id: params.id }, data });
  } catch {
    return NextResponse.json({ error: "Рассылка не найдена" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE — remove a broadcast (cascades to products + recipients).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.broadcast.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Рассылка не найдена" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
