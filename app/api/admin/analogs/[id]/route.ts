import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCode } from "@/lib/analogs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let body: { code?: string; brand?: string; sku?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const data: { code?: string; brand?: string | null; sku?: string } = {};
  if (body.code !== undefined) data.code = normalizeCode(String(body.code));
  if (body.brand !== undefined) data.brand = String(body.brand).trim() || null;
  if (body.sku !== undefined) data.sku = String(body.sku).trim();
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }
  await prisma.analog.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.analog.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
