import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";
import { clearDefaults } from "@/lib/addresses";

export const dynamic = "force-dynamic";

// Правка и удаление одного адреса клиента. Права те же, что у списка:
// ADMIN/RA — любому клиенту, MANAGER — своему, бухгалтер только смотрит.
async function guard(clientId: string, addressId: string) {
  const session = await getSession();
  if (!session) return { error: "Unauthorized", status: 401 as const };
  if (session.role === "CLIENT" || session.role === "ACCOUNTANT") {
    return { error: "Forbidden", status: 403 as const };
  }
  if (!(await managerOwnsClient(session, clientId))) {
    return { error: "Forbidden", status: 403 as const };
  }
  // Адрес должен принадлежать именно этому клиенту — иначе по чужому id
  // можно было бы править адреса другого.
  const addr = await prisma.clientAddress.findUnique({
    where: { id: addressId },
    select: { userId: true },
  });
  if (!addr || addr.userId !== clientId) {
    return { error: "Адрес не найден", status: 404 as const };
  }
  return null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; addressId: string } }
) {
  const bad = await guard(params.id, params.addressId);
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

  const data: {
    label?: string | null;
    city?: string | null;
    address?: string;
    isDefault?: boolean;
  } = {};
  if ("label" in body) data.label = (body.label ?? "").trim() || null;
  if ("city" in body) data.city = (body.city ?? "").trim() || null;
  if ("address" in body) {
    const v = (body.address ?? "").trim();
    if (!v) {
      return NextResponse.json({ error: "Адрес не может быть пустым" }, { status: 400 });
    }
    data.address = v;
  }
  if ("isDefault" in body) data.isDefault = Boolean(body.isDefault);

  await prisma.$transaction(async (tx) => {
    if (data.isDefault) await clearDefaults(params.id, params.addressId, tx);
    await tx.clientAddress.update({ where: { id: params.addressId }, data });
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; addressId: string } }
) {
  const bad = await guard(params.id, params.addressId);
  if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status });

  await prisma.clientAddress.delete({ where: { id: params.addressId } });

  // Клиент не должен остаться без основного адреса: если удалили именно
  // его, основным становится самый старый из оставшихся.
  const left = await prisma.clientAddress.findMany({
    where: { userId: params.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, isDefault: true },
  });
  if (left.length > 0 && !left.some((a) => a.isDefault)) {
    await prisma.clientAddress.update({
      where: { id: left[0].id },
      data: { isDefault: true },
    });
  }

  return NextResponse.json({ ok: true });
}
