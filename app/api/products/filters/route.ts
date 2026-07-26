import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { HIDDEN_CATEGORIES, NOT_HIDDEN_CATEGORY } from "@/lib/categories";
import {
  CATEGORY_TAXONOMY,
  nodePath,
  taxonomyCategories,
  type TaxNode,
} from "@/lib/category-tree";
import { cached } from "@/lib/cache";

export const dynamic = "force-dynamic";

export type CatTreeNode = {
  path: string; // node id sent back as `categoryGroup`
  label: string;
  count: number;
  category?: string; // exact 1С value when this node is a real leaf
  children: CatTreeNode[];
};

// Projects the curated taxonomy (lib/category-tree.ts) onto the categories
// that actually carry products right now. Empty branches are dropped, counts
// bubble up, and 1С categories missing from the taxonomy are appended at the
// root so nothing silently disappears from the catalog after a sync.
function buildCategoryTree(counts: Map<string, number>): CatTreeNode[] {
  const walk = (node: TaxNode, parentPath: string): CatTreeNode | null => {
    const path = nodePath(parentPath, node);
    if (node.category) {
      const count = counts.get(node.category) ?? 0;
      if (count === 0) return null;
      return { path, label: node.label, count, category: node.category, children: [] };
    }
    const children = (node.children ?? [])
      .map((c) => walk(c, path))
      .filter((c): c is CatTreeNode => c !== null);
    if (children.length === 0) return null;
    return {
      path,
      label: node.label,
      count: children.reduce((s, c) => s + c.count, 0),
      children,
    };
  };

  const tree = CATEGORY_TAXONOMY.map((n) => walk(n, "")).filter(
    (n): n is CatTreeNode => n !== null
  );

  const known = taxonomyCategories();
  const strays = [...counts.entries()]
    .filter(([name]) => !known.has(name))
    .sort((a, b) => a[0].localeCompare(b[0], "ru"))
    .map(([name, count]) => ({
      path: name,
      label: name,
      count,
      category: name,
      children: [] as CatTreeNode[],
    }));

  return [...tree, ...strays];
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Facets only change on a 1С sync → cache 120 s (sync also invalidates).
  const payload = await cached("catalog:filters", 120_000, async () => {
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

    const counts = new Map<string, number>();
    for (const c of catCounts) {
      if (c.category && !HIDDEN_CATEGORIES.has(c.category)) {
        counts.set(c.category, c._count._all);
      }
    }

    return {
      makes: makes.map((m) => m.brand).filter(Boolean),
      categories: [...counts.keys()],
      categoryTree: buildCategoryTree(counts),
      priceMin: Math.floor(Number(agg._min.price ?? 0)),
      priceMax: Math.ceil(Number(agg._max.price ?? 0)),
    };
  });

  return NextResponse.json(payload);
}
