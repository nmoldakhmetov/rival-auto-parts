import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { HIDDEN_CATEGORIES, NOT_HIDDEN_CATEGORY } from "@/lib/categories";

export const dynamic = "force-dynamic";

type CatLeaf = { name: string; count: number };
type CatNode = { group: string; count: number; leaf: boolean; children: CatLeaf[] };

// Categories from 1С are flat strings. We derive a 2-level tree by grouping on
// the first word (e.g. "Кузов Hyundai Elantra" → group "Кузов").
function buildCategoryTree(rows: CatLeaf[]): CatNode[] {
  const groups = new Map<string, CatLeaf[]>();
  for (const r of rows) {
    const key = r.name.split(/\s+/)[0] || r.name;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const tree: CatNode[] = [];
  for (const [group, children] of groups) {
    children.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const count = children.reduce((s, c) => s + c.count, 0);
    if (children.length === 1) {
      tree.push({ group: children[0].name, count, leaf: true, children: [] });
    } else {
      tree.push({ group, count, leaf: false, children });
    }
  }
  tree.sort((a, b) => a.group.localeCompare(b.group, "ru"));
  return tree;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [makes, catCounts, agg] = await Promise.all([
    prisma.product.findMany({
      where: { brand: { not: null }, ...NOT_HIDDEN_CATEGORY },
      distinct: ["brand"],
      select: { brand: true },
      orderBy: { brand: "asc" },
    }),
    prisma.product.groupBy({
      by: ["category"],
      where: { category: { not: null } },
      _count: { _all: true },
    }),
    prisma.product.aggregate({
      where: NOT_HIDDEN_CATEGORY,
      _min: { price: true },
      _max: { price: true },
    }),
  ]);

  const catRows: CatLeaf[] = catCounts
    .filter((c) => c.category && !HIDDEN_CATEGORIES.has(c.category))
    .map((c) => ({ name: c.category as string, count: c._count._all }));

  return NextResponse.json({
    makes: makes.map((m) => m.brand).filter(Boolean),
    categories: catRows.map((c) => c.name),
    categoryTree: buildCategoryTree(catRows),
    priceMin: Math.floor(Number(agg._min.price ?? 0)),
    priceMax: Math.ceil(Number(agg._max.price ?? 0)),
  });
}
