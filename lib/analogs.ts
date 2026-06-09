import "server-only";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────
//  Analog cross-reference: a big .xlsx (200k+ rows) maps an "analog number"
//  (col 1, sometimes itself an article) → brand (col 2) → the catalog article
//  (col 3, sku) that should be shown. Importing resets the whole table.
// ─────────────────────────────────────────────────────────────────────────

// Drop separators (spaces, dashes, dots, slashes, brackets) so "zeekr 9x",
// "zeekr9x", "zeekr-9x" and "zeekr 9 x" all collapse to the same key.
const SEP = /[\s\-_./()[\]]+/g;

export function normalizeCode(s: string): string {
  return s.trim().toUpperCase().replace(SEP, "");
}

// Lowercase variant used for Product.skuNorm / fullNameNorm matching.
export function normalizeSmart(s: string): string {
  return s.trim().toLowerCase().replace(SEP, "");
}

export type ImportResult = {
  ok: boolean;
  rows: number; // rows seen in the sheet
  imported: number; // analog records written
  durationMs: number;
  error?: string;
};

export async function importAnalogsFromBuffer(buf: Buffer): Promise<ImportResult> {
  const started = Date.now();
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) throw new Error("В файле не найдено ни одного листа");

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    }) as unknown[][];

    const records: { code: string; brand: string | null; sku: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!Array.isArray(r)) continue;
      const codeRaw = String(r[0] ?? "").trim();
      const brandRaw = String(r[1] ?? "").trim();
      const skuRaw = String(r[2] ?? "").trim();
      if (!codeRaw || !skuRaw) continue;
      // Skip a header row if the first line looks like column titles.
      if (
        i === 0 &&
        /^(код|code|артикул|sku|номер)$/i.test(codeRaw) &&
        /^(артикул|sku|article|код)$/i.test(skuRaw)
      ) {
        continue;
      }
      records.push({
        code: normalizeCode(codeRaw),
        brand: brandRaw || null,
        sku: skuRaw,
      });
    }

    // Full reset, then rebuild from the new file.
    await prisma.analog.deleteMany({});

    const BATCH = 5000;
    let imported = 0;
    for (let i = 0; i < records.length; i += BATCH) {
      const chunk = records.slice(i, i + BATCH);
      const res = await prisma.analog.createMany({ data: chunk });
      imported += res.count;
    }

    return {
      ok: true,
      rows: rows.length,
      imported,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    return {
      ok: false,
      rows: 0,
      imported: 0,
      durationMs: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type AnalogMatch = { sku: string; brand: string | null; code: string };

/** Resolve a typed query to the catalog articles it cross-references. */
export async function findAnalogMatches(query: string): Promise<AnalogMatch[]> {
  const code = normalizeCode(query);
  if (!code) return [];
  return prisma.analog.findMany({
    where: { code },
    select: { sku: true, brand: true, code: true },
    take: 50,
  });
}
