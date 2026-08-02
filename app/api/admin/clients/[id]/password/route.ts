import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";
import { checkPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

// POST /api/admin/clients/[id]/password — задать клиенту новый пароль.
//
// Кто может: ADMIN и RA — любому клиенту, MANAGER — только своим (клиент
// звонит менеджеру, а не в поддержку). ACCOUNTANT в разделе только смотрит.
// Сотрудников (менеджеров, бухгалтеров, RA) здесь не трогаем: их пароли
// меняет владелец через scripts/set-password.mjs.
//
// Текущий пароль не спрашивается — в том и смысл сброса: клиент его забыл.
// Новый пароль сообщает клиенту тот, кто сбросил; в базе только bcrypt-хэш.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "RA" && session.role !== "MANAGER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const password = body.password ?? "";
  const weak = checkPassword(password);
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, login: true, role: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Клиент не найден" }, { status: 404 });
  }
  if (target.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Через этот раздел меняется пароль только клиентам" },
      { status: 403 }
    );
  }
  if (!(await managerOwnsClient(session, target.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(password) },
  });

  // Сам пароль в лог не пишем — только кто и кому его сменил.
  console.log(
    `[auth] Пароль клиента «${target.login}» сброшен пользователем «${session.login}»`
  );

  return NextResponse.json({ ok: true });
}
