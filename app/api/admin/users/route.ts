import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

// Access is restricted to ADMIN by middleware (/api/admin/*).
// Creates a CLIENT or MANAGER account (closed registration → admin-driven).
export async function POST(req: NextRequest) {
  let body: {
    login?: string;
    password?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    comment?: string;
    role?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const login = body.login?.trim();
  const password = body.password ?? "";
  const fullName = body.fullName?.trim();
  const role = body.role === "MANAGER" ? "MANAGER" : "CLIENT";

  if (!login || !password || !fullName) {
    return NextResponse.json(
      { error: "Укажите логин, пароль и ФИО" },
      { status: 400 }
    );
  }
  if (password.length < 4) {
    return NextResponse.json(
      { error: "Пароль слишком короткий (мин. 4 символа)" },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        role,
        login,
        passwordHash: await hashPassword(password),
        fullName,
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        address: body.address?.trim() || null,
        city: body.city?.trim() || null,
        comment: body.comment?.trim() || null,
      },
    });
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        login: user.login,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        city: user.city,
        comment: user.comment,
        balance: Number(user.balance),
        discountPercent: user.discountPercent,
        createdAt: user.createdAt,
        role: user.role,
        isActive: user.isActive,
        managerId: user.managerId,
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const field = (e.meta?.target as string[])?.join(", ") ?? "поле";
      return NextResponse.json(
        { error: `Уже занято: ${field}` },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Не удалось создать пользователя" },
      { status: 500 }
    );
  }
}
