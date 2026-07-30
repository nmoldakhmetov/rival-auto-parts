import "server-only";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  normalizeCode as normCode,
  parseAnalogRows,
  type AnalogRecord,
} from "@/lib/analog-parse";

// ─────────────────────────────────────────────────────────────────────────
//  Analog cross-reference: a big .xlsx (200k+ rows) maps an "analog number"
//  (col 1, sometimes itself an article) → brand (col 2) → the catalog article
//  (col 3, sku) that should be shown. Importing resets the whole table.
// ─────────────────────────────────────────────────────────────────────────

// The normalizers and the row parser live in lib/analog-parse.ts so the
// browser can reuse them when it parses the .xlsx before upload.
export { normalizeCode, normalizeSmart } from "@/lib/analog-parse";

export type ImportResult = {
  ok: boolean;
  rows: number; // rows seen in the sheet
  imported: number; // analog records written
  durationMs: number;
  error?: string;
};

// Writes parsed records in batches. Used by both the legacy whole-file upload
// and the chunked client-side import.
export async function insertAnalogRecords(
  records: AnalogRecord[]
): Promise<number> {
  const BATCH = 5000;
  let imported = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const res = await prisma.analog.createMany({
      data: records.slice(i, i + BATCH),
    });
    imported += res.count;
  }
  return imported;
}

export async function resetAnalogs(): Promise<void> {
  await prisma.analog.deleteMany({});
}

// Normalizes and validates one chunk coming from the browser.
export function sanitizeAnalogChunk(input: unknown): AnalogRecord[] {
  if (!Array.isArray(input)) return [];
  const out: AnalogRecord[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const code = normCode(String(r.code ?? ""));
    const sku = String(r.sku ?? "").trim();
    if (!code || !sku) continue;
    const brand = String(r.brand ?? "").trim();
    out.push({ code, brand: brand || null, sku });
  }
  return out;
}

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

    const records = parseAnalogRows(rows);

    // Full reset, then rebuild from the new file.
    await prisma.analog.deleteMany({});
    const imported = await insertAnalogRecords(records);

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
  const code = normCode(query);
  if (!code) return [];
  return prisma.analog.findMany({
    where: { code },
    select: { sku: true, brand: true, code: true },
    take: 50,
  });
}
