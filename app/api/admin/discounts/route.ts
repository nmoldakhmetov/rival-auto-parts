import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeRule, type RuleBody } from "@/lib/discount-rules";
import { invalidatePrefix } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Access restricted to ADMIN by middleware (/api/admin/*).

export async function GET() {
  const rules = await prisma.discountRule.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, fullName: true, login: true } },
      products: {
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
      percent: r.percent,
      userId: r.userId,
      clientName: r.user?.fullName ?? null,
      clientLogin: r.user?.login ?? null,
      target: r.target,
      category: r.category,
      brand: r.brand,
      active: r.active,
      createdAt: r.createdAt,
      products: r.products
        .filter((p) => p.product)
        .map((p) => ({
          id: p.product.id,
          sku: p.product.sku,
          name: p.product.name,
          fullName: p.product.fullName,
        })),
    })),
  });
}

export async function POST(req: NextRequest) {
  let body: RuleBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const result = normalizeRule(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { productIds, ...data } = result.data;

  try {
    const rule = await prisma.discountRule.create({
      data: {
        ...data,
        products: { create: productIds.map((productId) => ({ productId })) },
      },
    });
    invalidatePrefix("disc:"); // cached discount contexts are now stale
    return NextResponse.json({ ok: true, id: rule.id });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2003"
    ) {
      return NextResponse.json({ error: "Клиент не найден" }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Не удалось создать скидку" },
      { status: 500 }
    );
  }
}
