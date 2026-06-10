import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeRule } from "@/lib/discount-rules";
import { invalidatePrefix } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Access restricted to ADMIN by middleware (/api/admin/*).

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  // Lightweight toggle: only `active` provided → flip it without re-validating.
  const onlyActive =
    typeof body.active === "boolean" &&
    body.percent === undefined &&
    body.target === undefined &&
    body.productIds === undefined &&
    body.name === undefined &&
    body.userId === undefined &&
    body.category === undefined &&
    body.brand === undefined;

  try {
    if (onlyActive) {
      await prisma.discountRule.update({
        where: { id: params.id },
        data: { active: body.active as boolean },
      });
      invalidatePrefix("disc:");
      return NextResponse.json({ ok: true });
    }

    const result = normalizeRule(body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const { productIds, ...data } = result.data;
    await prisma.discountRule.update({
      where: { id: params.id },
      data: {
        ...data,
        products: {
          deleteMany: {},
          create: productIds.map((productId) => ({ productId })),
        },
      },
    });
    invalidatePrefix("disc:");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Скидка не найдена" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.discountRule.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Скидка не найдена" }, { status: 404 });
  }
  invalidatePrefix("disc:");
  return NextResponse.json({ ok: true });
}
