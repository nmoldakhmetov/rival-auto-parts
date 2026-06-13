import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidatePrefix } from "@/lib/cache";
import { getSession } from "@/lib/auth";
import { managerOwnsClient } from "@/lib/admin-scope";

// PUT: replace the full set of warehouses a client may see stock for.
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { warehouseIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const session = await getSession();
  if (session && !(await managerOwnsClient(session, params.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ids = Array.isArray(body.warehouseIds)
    ? [...new Set(body.warehouseIds.filter((x) => typeof x === "string"))]
    : [];

  await prisma.$transaction([
    prisma.clientWarehouseAccess.deleteMany({ where: { userId: params.id } }),
    prisma.clientWarehouseAccess.createMany({
      data: ids.map((warehouseId) => ({ userId: params.id, warehouseId })),
      skipDuplicates: true,
    }),
  ]);

  // The search route caches warehouse access per user for 30 s.
  invalidatePrefix(`wh:${params.id}`);

  return NextResponse.json({ ok: true, count: ids.length });
}
