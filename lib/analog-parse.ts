// Pure helpers for the analog cross-reference, shared by the server (search,
// admin routes) and the BROWSER (the .xlsx is parsed client-side before upload
// — see components/admin/AnalogsManager.tsx). No prisma, no "server-only".

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

export type AnalogRecord = { code: string; brand: string | null; sku: string };

// Column headers seen in the exports we get: the file may start with a real
// header row, a partial one («Деталь2», «Производитель2»), or no header at all.
const HEADER_WORDS =
  /^(код|code|артикул|sku|article|номер|бренд|brand|деталь\d*|производитель\d*|наименование)$/i;

function looksLikeHeader(cells: string[]): boolean {
  const filled = cells.filter(Boolean);
  if (filled.length === 0) return false;
  // A header row has no digits-only cells and at least one known caption.
  return (
    filled.some((c) => HEADER_WORDS.test(c)) &&
    !filled.every((c) => /^\d+$/.test(c))
  );
}

// Rows come from XLSX.utils.sheet_to_json(sheet, { header: 1 }).
// Used columns: 0 = код аналога, 1 = бренд, 2 = артикул каталога (sku).
export function parseAnalogRows(rows: unknown[][]): AnalogRecord[] {
  const out: AnalogRecord[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const code = String(r[0] ?? "").trim();
    const brand = String(r[1] ?? "").trim();
    const sku = String(r[2] ?? "").trim();
    if (!code || !sku) continue;
    // Only the first couple of lines can be captions; skip them.
    if (i < 2 && looksLikeHeader([code, brand, sku])) continue;
    out.push({ code: normalizeCode(code), brand: brand || null, sku });
  }
  return out;
}
