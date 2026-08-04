import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hashPassword } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";
import { checkPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

// POST /api/admin/clients/[id]/password — задать пользователю новый пароль.
//
// Кто кому может:
//   ADMIN      — вообще всем: клиентам и сотрудникам (менеджеры, бухгалтеры,
//                RA), включая другого администратора;
//   RA         — клиентам и сотрудникам, КРОМЕ администраторов: иначе RA
//                сменил бы пароль владельцу и забрал аккаунт с полными
//                правами, включая «Настройки», которых у него нет;
//   MANAGER    — только своим клиентам (клиент звонит менеджеру, а не в
//                поддержку);
//   ACCOUNTANT — никому, у него раздел только на чтение.
//
// Текущий пароль не спрашивается — в том и смысл сброса: его забыли.
// Новый пароль сообщает пользователю тот, кто сбросил; в базе только
// bcrypt-хэш, в лог пишем факт, но не сам пароль.
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
    return NextResponse.json(
      { error: "Пользователь не найден" },
      { status: 404 }
    );
  }

  if (target.role === "CLIENT") {
    // Менеджер — только своим; остальным ролям managerOwnsClient вернёт true.
    if (!(await managerOwnsClient(session, target.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    // Сотрудник: менеджеру и бухгалтеру сюда нельзя, RA — мимо администратора.
    if (session.role === "MANAGER") {
      return NextResponse.json(
        { error: "Пароли сотрудников меняет администратор" },
        { status: 403 }
      );
    }
    if (session.role === "RA" && target.role === "ADMIN") {
      return NextResponse.json(
        { error: "Пароль администратора меняет только сам администратор" },
        { status: 403 }
      );
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(password) },
  });

  // Сам пароль в лог не пишем — только кто и кому его сменил.
  console.log(
    `[auth] Пароль пользователя «${target.login}» (${target.role}) сброшен пользователем «${session.login}»`
  );

  return NextResponse.json({ ok: true });
}
