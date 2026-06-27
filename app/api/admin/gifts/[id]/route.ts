import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidatePrefix } from "@/lib/cache";
import { normalizeGift, type GiftBody } from "@/lib/gift-rules";

// Access restricted to ADMIN/RA by middleware (section "gifts").

// PATCH: toggle active (just { active }) OR full edit (name/minQty/triggers/gifts).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: GiftBody & { active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const exists = await prisma.giftRule.findUnique({ where: { id: params.id } });
  if (!exists) {
    return NextResponse.json({ error: "Правило не найдено" }, { status: 404 });
  }

  // Toggle-only payload: just the active flag, no products supplied.
  const toggleOnly =
    body.triggerIds === undefined &&
    body.giftIds === undefined &&
    body.minQty === undefined &&
    body.name === undefined;

  if (toggleOnly) {
    await prisma.giftRule.update({
      where: { id: params.id },
      data: { active: body.active !== false },
    });
    invalidatePrefix("gifts:");
    return NextResponse.json({ ok: true });
  }

  const result = normalizeGift(body);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { triggerIds, giftIds, ...data } = result.data;

  // Replace the trigger/gift sets atomically.
  await prisma.$transaction([
    prisma.giftRuleTrigger.deleteMany({ where: { ruleId: params.id } }),
    prisma.giftRuleGift.deleteMany({ where: { ruleId: params.id } }),
    prisma.giftRule.update({
      where: { id: params.id },
      data: {
        ...data,
        triggers: { create: triggerIds.map((productId) => ({ productId })) },
        gifts: { create: giftIds.map((productId) => ({ productId })) },
      },
    }),
  ]);
  invalidatePrefix("gifts:");
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.giftRule.delete({ where: { id: params.id } }).catch(() => {});
  invalidatePrefix("gifts:");
  return NextResponse.json({ ok: true });
}
