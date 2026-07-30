import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  importAnalogsFromBuffer,
  insertAnalogRecords,
  resetAnalogs,
  sanitizeAnalogChunk,
} from "@/lib/analogs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Rebuilds the analog table.
//
// Two ways in:
//
//  • JSON chunks (preferred) — the browser parses the .xlsx itself and posts
//    batches of records. The real files are 7+ MB / 300k rows, which no longer
//    fits a single request: Vercel caps a function body at 4.5 MB and IIS/ARR
//    has its own upload limits, so the whole-file upload failed with a bare
//    "сервер недоступен". Chunking also lets the UI show live progress.
//    Body: { records: [{code, brand, sku}], reset?: boolean }
//
//  • multipart/form-data with the whole file — kept for small sheets and any
//    external caller that already used it.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: { records?: unknown; reset?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Некорректный запрос" },
        { status: 400 }
      );
    }

    const records = sanitizeAnalogChunk(body.records);
    // The first chunk wipes the old table, then every chunk appends.
    if (body.reset) await resetAnalogs();
    const imported = records.length ? await insertAnalogRecords(records) : 0;
    return NextResponse.json({ ok: true, imported });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ожидается файл .xlsx" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const result = await importAnalogsFromBuffer(buf);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
