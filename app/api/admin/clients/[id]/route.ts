import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidatePrefix } from "@/lib/cache";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";

// PATCH: update a client — manager, active state, balance, city, comment.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: {
    managerId?: string | null;
    isActive?: boolean;
    balance?: number | string;
    city?: string;
    comment?: string;
    discountPercent?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const data: Prisma.UserUncheckedUpdateInput = {};
  if ("managerId" in body) data.managerId = body.managerId || null;
  if ("isActive" in body) data.isActive = Boolean(body.isActive);
  if ("balance" in body) {
    const b = Number(body.balance);
    if (Number.isFinite(b)) data.balance = b;
  }
  if ("city" in body) data.city = String(body.city ?? "").trim() || null;
  if ("comment" in body) data.comment = String(body.comment ?? "").trim() || null;
  if ("discountPercent" in body) {
    data.discountPercent = Math.max(
      0,
      Math.min(95, Math.trunc(Number(body.discountPercent) || 0))
    );
    // The search route caches the per-user discount context for 30 s.
    invalidatePrefix(`disc:${params.id}`);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  // A manager may only edit their own clients.
  const session = await getSession();
  if (session && !(await managerOwnsClient(session, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Handing a client over is an owner-level action. A MANAGER doing it would
  // instantly lose access to that client (they only see their own) with no way
  // to undo it — which is exactly how clients went missing in production.
  // Unassigning ("— не назначен —") loses them just the same, so both are
  // refused here; reassignment stays available to ADMIN/RA.
  if (session?.role === "MANAGER" && "managerId" in body) {
    if (data.managerId !== session.sub) {
      return NextResponse.json(
        {
          error:
            "Передать клиента другому менеджеру может только администратор",
        },
        { status: 403 }
      );
    }
  }

  // Guard: if assigning a manager, make sure the target really is a MANAGER.
  if (typeof data.managerId === "string" && data.managerId) {
    const mgr = await prisma.user.findUnique({ where: { id: data.managerId } });
    if (!mgr || mgr.role !== "MANAGER") {
      return NextResponse.json(
        { error: "Указанный пользователь не является менеджером" },
        { status: 400 }
      );
    }
  }

  await prisma.user.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}
