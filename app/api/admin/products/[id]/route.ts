import { NextRequest, NextResponse } from "next/server";
import { ProductBadge } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// PATCH: pin/unpin a card or set its badge (новинка / хит продаж).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { pinned?: boolean; badge?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const data: {
    pinned?: boolean;
    pinnedAt?: Date | null;
    badge?: ProductBadge | null;
  } = {};

  if ("pinned" in body) {
    data.pinned = Boolean(body.pinned);
    data.pinnedAt = body.pinned ? new Date() : null;
  }
  if ("badge" in body) {
    data.badge =
      body.badge === "NEW" || body.badge === "HIT"
        ? (body.badge as ProductBadge)
        : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  await prisma.product.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}
