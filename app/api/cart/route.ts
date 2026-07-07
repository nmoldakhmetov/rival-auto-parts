import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isPairOnly, snapPairQty } from "@/lib/pair-only";

export const dynamic = "force-dynamic";

// Mirror the client cart to the server so admins can see it.
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { items?: { productId?: string; qty?: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const incoming = Array.isArray(body.items) ? body.items : [];
  const ids = [
    ...new Set(
      incoming
        .map((i) => i.productId)
        .filter((x): x is string => typeof x === "string" && x.length > 0)
    ),
  ];

  // Keep only items that still reference existing products (avoid FK errors).
  const existing =
    ids.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: ids } },
          select: { id: true, category: true },
        })
      : [];
  const existingIds = new Set(existing.map((p) => p.id));
  const pairIds = new Set(
    existing.filter((p) => isPairOnly(p.category)).map((p) => p.id)
  );

  const data = incoming
    .filter((i) => i.productId && existingIds.has(i.productId))
    .map((i) => {
      const raw = Math.max(1, Math.trunc(Number(i.qty) || 1));
      return {
        userId: session.sub,
        productId: i.productId as string,
        // «Диски UIDNU»: строго чётное количество и на сервере тоже.
        qty: pairIds.has(i.productId as string) ? snapPairQty(raw) : raw,
      };
    });

  await prisma.$transaction([
    prisma.savedCartItem.deleteMany({ where: { userId: session.sub } }),
    ...(data.length
      ? [prisma.savedCartItem.createMany({ data, skipDuplicates: true })]
      : []),
  ]);

  return NextResponse.json({ ok: true, count: data.length });
}
