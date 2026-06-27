import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { cached } from "@/lib/cache";
import { normalizeSmart } from "@/lib/analogs";
import { NOT_HIDDEN_CATEGORY } from "@/lib/categories";

export const dynamic = "force-dynamic";

// Generation / trim suffixes that should be stripped from a base model name.
const GEN_CODES = new Set([
  "nf", "yf", "lf", "df", "mc", "fl", "ev", "gt", "cw", "tm", "jm", "fe2",
]);

// Collapse a fragmented detected model ("Sonata 2", "Sonata V 3", "Santa FE 2",
// "Getz 02-- Sonata") down to its base name ("Sonata", "Santa FE", "Getz"):
// keep leading word tokens, stop at the first generation number / year, then
// drop trailing single-letter or known generation codes.
function baseModel(m: string): string {
  const out: string[] = [];
  for (const t of m.trim().split(/\s+/)) {
    if (!/[a-zа-яё]/i.test(t)) break; // no letter → generation number / year
    out.push(t);
    if (out.join(" ").length >= 22) break;
  }
  while (out.length > 1) {
    const last = out[out.length - 1].toLowerCase();
    if (last.length === 1 || GEN_CODES.has(last)) out.pop();
    else break;
  }
  return out.join(" ");
}

// Models for a make. Each option is a BASE model name; selecting it filters by
// a text match in full_name (the search route does the same), so picking a
// model == typing it in the search box. Counts are the real full_name matches.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const make = (req.nextUrl.searchParams.get("make") ?? "").trim();
  if (!make) return NextResponse.json({ models: [] });

  // Only changes on a 1С sync → cache per make (sync invalidates catalog:*).
  const models = await cached(`catalog:models:${make}`, 300_000, async () => {
    // Candidate model names are derived from THIS make's products…
    const products = await prisma.product.findMany({
      where: {
        brand: make,
        fullNameNorm: { not: null },
        ...NOT_HIDDEN_CATEGORY,
      },
      select: { model: true },
    });

    // …but counts are GLOBAL and use the SAME field set as the search route's
    // text match (sku / name / full_name + normalized columns), so the badge
    // number equals exactly what selecting the model returns. Shared across
    // makes; refreshed on sync (catalog: prefix invalidation).
    const all = await cached("catalog:models:_allrows", 300_000, () =>
      prisma.product.findMany({
        where: { fullNameNorm: { not: null }, ...NOT_HIDDEN_CATEGORY },
        select: {
          sku: true,
          name: true,
          fullName: true,
          skuNorm: true,
          fullNameNorm: true,
        },
      })
    );

    // Mirror of the search route's textSearchOr predicate, in memory.
    const matches = (
      r: (typeof all)[number],
      termLower: string,
      norm: string
    ): boolean => {
      if (r.sku.toLowerCase().includes(termLower)) return true;
      if (r.name.toLowerCase().includes(termLower)) return true;
      if (r.fullName && r.fullName.toLowerCase().includes(termLower)) return true;
      if (norm.length >= 2) {
        if (r.skuNorm && r.skuNorm.includes(norm)) return true;
        if (r.fullNameNorm && r.fullNameNorm.includes(norm)) return true;
      }
      return false;
    };

    // Distinct base names derived from the detected model field.
    const display = new Map<string, string>(); // normKey → display name
    for (const p of products) {
      if (!p.model) continue;
      const base = baseModel(p.model);
      const key = normalizeSmart(base);
      if (key.length < 2) continue;
      if (!display.has(key)) display.set(key, base);
    }

    return [...display.entries()]
      .map(([key, name]) => {
        const termLower = name.toLowerCase();
        return {
          name,
          count: all.reduce((acc, r) => acc + (matches(r, termLower, key) ? 1 : 0), 0),
        };
      })
      .filter((m) => m.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"))
      .slice(0, 80);
  });

  return NextResponse.json({ models });
}
