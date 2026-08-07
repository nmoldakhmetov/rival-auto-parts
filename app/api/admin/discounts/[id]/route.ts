import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  normalizeRule,
  duplicateScopeOf,
  duplicateRuleMessage,
} from "@/lib/discount-rules";
import { invalidatePrefix } from "@/lib/cache";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";

export const dynamic = "force-dynamic";

// Секцию открывает middleware (/api/admin/*), но этого мало: менеджер имеет
// к ней доступ и по id мог править ЧУЖИЕ правила, включая общие «всем
// клиентам». Поэтому здесь проверяем владение правилом.
async function managerMayTouch(ruleId: string) {
  const session = await getSession();
  if (!session || session.role !== "MANAGER") return null;
  const rule = await prisma.discountRule.findUnique({
    where: { id: ruleId },
    select: { userId: true },
  });
  if (!rule) return { error: "Скидка не найдена", status: 404 as const };
  // Общие правила (userId = null) менеджеру недоступны — их ставит владелец.
  if (!rule.userId || !(await managerOwnsClient(session, rule.userId))) {
    return { error: "Можно менять скидки только своих клиентов", status: 403 as const };
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await managerMayTouch(params.id);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

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
    // Тот же запрет дублей, что при создании, но себя не считаем.
    const scope = duplicateScopeOf(result.data);
    if (scope && result.data.active) {
      const clash = await prisma.discountRule.findFirst({
        where: { ...scope, id: { not: params.id } },
      });
      if (clash) {
        return NextResponse.json(
          { error: duplicateRuleMessage(result.data), conflictId: clash.id },
          { status: 409 }
        );
      }
    }
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
  const denied = await managerMayTouch(params.id);
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.status });
  }

  try {
    await prisma.discountRule.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "Скидка не найдена" }, { status: 404 });
  }
  invalidatePrefix("disc:");
  return NextResponse.json({ ok: true });
}
