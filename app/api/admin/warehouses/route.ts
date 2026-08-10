import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { invalidatePrefix } from "@/lib/cache";
import { defaultColorFor, normalizeColor } from "@/lib/warehouse-colors";

export const dynamic = "force-dynamic";

// Склады и цвета их плашек в каталоге.
//
// GET — список со «своим» цветом и цветом по умолчанию (по нему кнопка
// «сбросить» в админке понимает, есть ли что сбрасывать).
// PATCH { id, color } — сменить цвет; color = null возвращает склад к
// значению по умолчанию.
//
// Менять может владелец (ADMIN/RA) — это оформление витрины, а не данные
// клиента; остальным ролям только чтение.

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });

  return NextResponse.json({
    warehouses: rows.map((w) => ({
      id: w.id,
      name: w.name,
      // Нормализуем: в базе может лежать ключ первой версии («green»).
      color: normalizeColor(w.color),
      defaultColor: defaultColorFor(w.name),
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "RA") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { id?: string; color?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "Склад не указан" }, { status: 400 });
  }
  // null (или пусто) — сброс к цвету по умолчанию. Всё остальное приводим
  // к #rrggbb: цвет произвольный, но в базе лежит в одном виде.
  const raw = body.color == null || body.color === "" ? null : body.color;
  const color = raw === null ? null : normalizeColor(raw);
  if (raw !== null && color === null) {
    return NextResponse.json(
      { error: "Некорректный цвет — ожидается код вида #1A2B3C" },
      { status: 400 }
    );
  }

  try {
    await prisma.warehouse.update({ where: { id }, data: { color } });
  } catch {
    return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
  }

  // Каталог отдаёт цвета вместе с остатками и кэшируется — сбрасываем.
  invalidatePrefix("catalog:");
  invalidatePrefix("cfg:");

  return NextResponse.json({ ok: true });
}
