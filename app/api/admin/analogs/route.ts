import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeCode } from "@/lib/analogs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const PAGE_SIZE = 50;

  const where: Prisma.AnalogWhereInput = q
    ? {
        OR: [
          { code: { contains: q.toUpperCase() } },
          { sku: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [total, rows] = await Promise.all([
    prisma.analog.count({ where }),
    prisma.analog.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return NextResponse.json({
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

export async function POST(req: NextRequest) {
  let body: { code?: string; brand?: string; sku?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const code = normalizeCode(String(body.code ?? ""));
  const sku = String(body.sku ?? "").trim();
  const brand = String(body.brand ?? "").trim() || null;
  if (!code || !sku) {
    return NextResponse.json(
      { error: "Укажите код аналога и артикул товара" },
      { status: 400 }
    );
  }
  const analog = await prisma.analog.create({ data: { code, sku, brand } });
  return NextResponse.json({ ok: true, analog });
}
