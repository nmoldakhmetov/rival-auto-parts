import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, verifyPassword, hashPassword } from "@/lib/auth";
import { checkPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

// POST /api/auth/password — смена СВОЕГО пароля (любая роль).
// Обязательно требует текущий пароль: сессия живёт 30 дней, и без этой
// проверки любой доступ к незалоченному телефону менял бы пароль навсегда.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const current = body.currentPassword ?? "";
  const next = body.newPassword ?? "";

  if (!current || !next) {
    return NextResponse.json(
      { error: "Заполните текущий и новый пароль" },
      { status: 400 }
    );
  }
  const weak = checkPassword(next);
  if (weak) {
    return NextResponse.json({ error: weak }, { status: 400 });
  }
  if (next === current) {
    return NextResponse.json(
      { error: "Новый пароль совпадает с текущим" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: session.sub } });
  if (!user) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  if (!(await verifyPassword(current, user.passwordHash))) {
    return NextResponse.json({ error: "Текущий пароль неверный" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });

  // Пароли в логи не попадают — только факт смены.
  console.log(`[auth] Пароль изменён пользователем «${user.login}»`);

  return NextResponse.json({ ok: true });
}
