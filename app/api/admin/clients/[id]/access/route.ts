import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  return NextResponse.json({ ok: true, count: ids.length });
}
