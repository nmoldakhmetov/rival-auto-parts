import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidatePrefix } from "@/lib/cache";
import { normalizeGift, type GiftBody } from "@/lib/gift-rules";

export const dynamic = "force-dynamic";

// Access restricted to ADMIN/RA by middleware (section "gifts").

export async function GET() {
  const rules = await prisma.giftRule.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      triggers: {
        include: {
          product: { select: { id: true, sku: true, name: true, fullName: true } },
        },
      },
      gifts: {
        include: {
          product: { select: { id: true, sku: true, name: true, fullName: true } },
        },
      },
    },
  });

  return NextResponse.json({
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      minQty: r.minQty,
      active: r.active,
      createdAt: r.createdAt,
      triggers: r.triggers
        .filter((t) => t.product)
        .map((t) => ({
          id: t.product.id,
          sku: t.product.sku,
          name: t.product.name,
          fullName: t.product.fullName,
        })),
      gifts: r.gifts
        .filter((g) => g.product)
        .map((g) => ({
          id: g.product.id,
          sku: g.product.sku,
          name: g.product.name,
          fullName: g.product.fullName,
        })),
    })),
  });
}

export async function POST(req: NextRequest) {
  let body: GiftBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const result = normalizeGift(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { triggerIds, giftIds, ...data } = result.data;

  const rule = await prisma.giftRule.create({
    data: {
      ...data,
      triggers: { create: triggerIds.map((productId) => ({ productId })) },
      gifts: { create: giftIds.map((productId) => ({ productId })) },
    },
  });
  invalidatePrefix("gifts:");
  return NextResponse.json({ ok: true, id: rule.id });
}
