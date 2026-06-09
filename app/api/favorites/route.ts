import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ids: [] });
  const favs = await prisma.favorite.findMany({
    where: { userId: session.sub },
    select: { productId: true },
  });
  return NextResponse.json({ ids: favs.map((f) => f.productId) });
}

// Toggle a product in the current user's favorites.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!body.productId) {
    return NextResponse.json({ error: "Нет товара" }, { status: 400 });
  }

  const where = {
    userId_productId: { userId: session.sub, productId: body.productId },
  };
  const existing = await prisma.favorite.findUnique({ where });
  if (existing) {
    await prisma.favorite.delete({ where });
    return NextResponse.json({ favorited: false });
  }
  await prisma.favorite
    .create({ data: { userId: session.sub, productId: body.productId } })
    .catch(() => {});
  return NextResponse.json({ favorited: true });
}
