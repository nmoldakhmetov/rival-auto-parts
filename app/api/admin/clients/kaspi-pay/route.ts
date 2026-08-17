import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { clientWhere } from "@/lib/admin-scope";

export const dynamic = "force-dynamic";

// Массовое разрешение/запрет онлайн-оплаты Kaspi.
//
// На проде клиентов сотни, и отмечать их по одному невозможно — раздел
// «Клиенты» умеет выделить пачку (или всех, кто подошёл под фильтр) и
// переключить одним действием.
//
// Права те же, что у одиночной правки: менеджер — только своим клиентам,
// ADMIN/RA — любым, бухгалтер не правит ничего. Чужие id молча отсекаются
// скоупом, а не отклоняют весь запрос: в выделении может оказаться строка,
// которую менеджер видеть не должен.

const MAX_IDS = 5000;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.role === "ACCOUNTANT") {
    return NextResponse.json(
      { error: "У бухгалтера нет прав на изменение данных" },
      { status: 403 }
    );
  }

  let body: { ids?: unknown; enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const ids = (Array.isArray(body.ids) ? body.ids : [])
    .filter((x): x is string => typeof x === "string" && x.length > 0)
    .slice(0, MAX_IDS);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Никто не выбран" }, { status: 400 });
  }
  const enabled = Boolean(body.enabled);

  // clientWhere добавляет скоуп менеджера («только свои»), поэтому чужие
  // клиенты в выборку не попадут даже при подделанном списке id.
  const res = await prisma.user.updateMany({
    // role: CLIENT — оплату разрешают покупателям; сотрудник в список
    // выделения попасть не может, но и подделанный id ничего не сделает.
    where: { ...clientWhere(session), role: "CLIENT", id: { in: ids } },
    data: { kaspiPayEnabled: enabled },
  });

  return NextResponse.json({ ok: true, updated: res.count, enabled });
}
