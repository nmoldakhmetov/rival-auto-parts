import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let body: { login?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const login = body.login?.trim();
  const password = body.password ?? "";

  if (!login || !password) {
    return NextResponse.json(
      { error: "Введите логин и пароль" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { login } });

  // Blocked clients CAN log in (they'll see a block overlay) — only missing
  // user / wrong password is rejected here.
  if (!user) {
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "Неверный логин или пароль" },
      { status: 401 }
    );
  }

  await createSessionCookie({
    sub: user.id,
    role: user.role,
    login: user.login,
    fullName: user.fullName,
  });

  return NextResponse.json({ ok: true, role: user.role });
}
