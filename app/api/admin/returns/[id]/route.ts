import { NextRequest, NextResponse } from "next/server";
import { ReturnStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";

const STATUSES = new Set<string>(["NEW", "PROCESSING", "ACCEPTED", "REJECTED"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!body.status || !STATUSES.has(body.status)) {
    return NextResponse.json({ error: "Некорректный статус" }, { status: 400 });
  }
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Некорректный id" }, { status: 400 });
  }
  const session = await getSession();
  if (session?.role === "MANAGER") {
    const ret = await prisma.return.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!ret || !(await managerOwnsClient(session, ret.userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  await prisma.return.update({
    where: { id },
    data: { status: body.status as ReturnStatus },
  });
  return NextResponse.json({ ok: true });
}
