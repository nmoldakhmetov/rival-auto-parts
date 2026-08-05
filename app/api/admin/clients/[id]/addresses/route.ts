import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";
import { addressesOf, clearDefaults } from "@/lib/addresses";

export const dynamic = "force-dynamic";

// Адреса доставки клиента: список и добавление.
// Правят персонал (ADMIN/RA — любому, MANAGER — своим); бухгалтер только
// смотрит, как и в остальной карточке клиента.
async function guard(clientId: string, write: boolean) {
  const session = await getSession();
  if (!session) return { error: "Unauthorized", status: 401 as const };
  if (session.role === "CLIENT") return { error: "Forbidden", status: 403 as const };
  if (write && session.role === "ACCOUNTANT") {
    return { error: "У бухгалтера нет прав на изменение данных", status: 403 as const };
  }
  const target = await prisma.user.findUnique({
    where: { id: clientId },
    select: { role: true },
  });
  if (!target) return { error: "Клиент не найден", status: 404 as const };
  if (target.role !== "CLIENT") {
    return { error: "Адреса есть только у клиентов", status: 400 as const };
  }
  if (!(await managerOwnsClient(session, clientId))) {
    return { error: "Forbidden", status: 403 as const };
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const bad = await guard(params.id, false);
  if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status });
  return NextResponse.json({ addresses: await addressesOf(params.id) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const bad = await guard(params.id, true);
  if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status });

  let body: {
    label?: string;
    city?: string;
    address?: string;
    isDefault?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const address = (body.address ?? "").trim();
  if (!address) {
    return NextResponse.json(
      { error: "Укажите адрес (улица, дом)" },
      { status: 400 }
    );
  }

  // Первый адрес клиента автоматически становится основным — иначе в
  // корзине не из чего было бы подставлять по умолчанию.
  const existing = await prisma.clientAddress.count({ where: { userId: params.id } });
  const isDefault = Boolean(body.isDefault) || existing === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) await clearDefaults(params.id, undefined, tx);
    return tx.clientAddress.create({
      data: {
        userId: params.id,
        label: (body.label ?? "").trim() || null,
        city: (body.city ?? "").trim() || null,
        address,
        isDefault,
      },
    });
  });

  return NextResponse.json({ ok: true, id: created.id });
}
