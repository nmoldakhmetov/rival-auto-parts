import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Records a product-card view (used for "most visited" statistics).
export async function POST(req: NextRequest) {
  const session = await getSession();
  let body: { productId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.productId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  prisma.productView
    .create({
      data: { productId: body.productId, userId: session?.sub ?? null },
    })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
