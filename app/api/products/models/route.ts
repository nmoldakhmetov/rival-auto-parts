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
    const products = await prisma.product.findMany({
      // Same visibility as the catalog (hidden 1С folders excluded) so the
      // counts here match what selecting the model actually returns.
      where: {
        brand: make,
        fullNameNorm: { not: null },
        ...NOT_HIDDEN_CATEGORY,
      },
      select: { model: true, fullNameNorm: true },
    });

    // Distinct base names derived from the detected model field.
    const display = new Map<string, string>(); // normKey → display name
    for (const p of products) {
      if (!p.model) continue;
      const base = baseModel(p.model);
      const key = normalizeSmart(base);
      if (key.length < 2) continue;
      if (!display.has(key)) display.set(key, base);
    }

    // Count = products of this make whose applicability mentions the model.
    const norms = products.map((p) => p.fullNameNorm as string);
    return [...display.entries()]
      .map(([key, name]) => ({
        name,
        count: norms.reduce((acc, fn) => acc + (fn.includes(key) ? 1 : 0), 0),
      }))
      .filter((m) => m.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"))
      .slice(0, 80);
  });

  return NextResponse.json({ models });
}
