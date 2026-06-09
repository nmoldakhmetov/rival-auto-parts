import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Distinct car models for a given make (for the dependent model filter).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const make = (req.nextUrl.searchParams.get("make") ?? "").trim();
  if (!make) return NextResponse.json({ models: [] });

  const grouped = await prisma.product.groupBy({
    by: ["model"],
    where: { brand: make, model: { not: null } },
    _count: { _all: true },
  });

  const models = grouped
    .filter((g) => g.model)
    .map((g) => ({ name: g.model as string, count: g._count._all }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"))
    .slice(0, 80);

  return NextResponse.json({ models });
}
