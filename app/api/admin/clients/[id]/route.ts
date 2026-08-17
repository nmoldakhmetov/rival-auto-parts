import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";

// PATCH: update a client — manager, active state, city, comment.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: {
    managerId?: string | null;
    isActive?: boolean;
    // Разрешение на онлайн-оплату Kaspi Pay (галочка в «Клиентах»).
    kaspiPayEnabled?: boolean;
    city?: string;
    comment?: string;
    // Профиль: правится и для клиентов, и для сотрудников.
    fullName?: string;
    login?: string;
    email?: string;
    phone?: string;
    address?: string;
    telegramId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const data: Prisma.UserUncheckedUpdateInput = {};
  if ("managerId" in body) data.managerId = body.managerId || null;
  if ("isActive" in body) data.isActive = Boolean(body.isActive);
  // Кому разрешена оплата Kaspi. Ставит любой сотрудник, который и так
  // правит карточку клиента: менеджер — своим, ADMIN/RA — всем.
  if ("kaspiPayEnabled" in body) {
    data.kaspiPayEnabled = Boolean(body.kaspiPayEnabled);
  }
  // Баланс вручную НЕ правится: он считается по формуле из заказов
  // (lib/balance.ts), и ручная правка всё равно затёрлась бы при первом же
  // изменении заказа. Двигать долг можно только полем «оплачено» в «Заказах».
  if ("city" in body) data.city = String(body.city ?? "").trim() || null;
  if ("comment" in body) data.comment = String(body.comment ?? "").trim() || null;
  if ("address" in body) data.address = String(body.address ?? "").trim() || null;
  if ("email" in body) data.email = String(body.email ?? "").trim() || null;
  if ("phone" in body) data.phone = String(body.phone ?? "").trim() || null;
  if ("telegramId" in body) {
    // Telegram chat_id — только цифры (у пользователей положительные).
    const raw = String(body.telegramId ?? "").trim();
    if (raw && !/^-?\d+$/.test(raw)) {
      return NextResponse.json(
        { error: "Telegram ID — это число, например 123456789 (узнать: @userinfobot)" },
        { status: 400 }
      );
    }
    data.telegramId = raw || null;
  }
  // ФИО и логин обязательны — пустыми их затирать нельзя.
  if ("fullName" in body) {
    const v = String(body.fullName ?? "").trim();
    if (!v) {
      return NextResponse.json(
        { error: "ФИО не может быть пустым" },
        { status: 400 }
      );
    }
    data.fullName = v;
  }
  if ("login" in body) {
    const v = String(body.login ?? "").trim();
    if (!v) {
      return NextResponse.json(
        { error: "Логин не может быть пустым" },
        { status: 400 }
      );
    }
    data.login = v;
  }
  // Discounts are deliberately NOT editable here: they all live in the
  // «Скидки» section (DiscountRule), so a manager has exactly one place to
  // set them. The legacy User.discountPercent column is still honoured by
  // lib/pricing.ts — migrate leftovers with scripts/migrate-personal-discounts.mjs.

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const session = await getSession();
  // ACCOUNTANT has the clients tab but is read-only there.
  if (session?.role === "ACCOUNTANT") {
    return NextResponse.json(
      { error: "У бухгалтера нет прав на изменение данных" },
      { status: 403 }
    );
  }

  // Staff records (MANAGER / ACCOUNTANT / RA) are owner-level territory.
  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { role: true, isActive: true, blockedByRole: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }
  if (target.role !== "CLIENT" && session?.role !== "ADMIN" && session?.role !== "RA") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A manager may only edit their own clients.
  if (session && target.role === "CLIENT" && !(await managerOwnsClient(session, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Блокировку владельца снимает только владелец.
  //
  // Менеджер видит своих клиентов и раньше мог включить обратно любого — в
  // том числе того, кого выключил администратор, и решение владельца
  // держалось до первого клика. Запоминаем, кто выключил: ADMIN/RA —
  // снимает только ADMIN/RA; автоблокировка за долг (blockedByRole = null)
  // по-прежнему снимается менеджером, он же разбирается с оплатой.
  if ("isActive" in body) {
    const owner = session?.role === "ADMIN" || session?.role === "RA";
    const turningOn = Boolean(body.isActive);
    if (
      turningOn &&
      !target.isActive &&
      (target.blockedByRole === "ADMIN" || target.blockedByRole === "RA") &&
      !owner
    ) {
      return NextResponse.json(
        {
          error:
            "Этого пользователя заблокировал администратор — снять блокировку может только он",
        },
        { status: 403 }
      );
    }
    // Помечаем автора блокировки и стираем метку при разблокировке.
    data.blockedByRole = turningOn ? null : session?.role ?? null;
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

  try {
    await prisma.user.update({ where: { id: params.id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const field = (e.meta?.target as string[])?.join(", ") ?? "поле";
      return NextResponse.json({ error: `Уже занято: ${field}` }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}
