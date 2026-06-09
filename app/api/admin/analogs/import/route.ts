import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { importAnalogsFromBuffer } from "@/lib/analogs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Upload an .xlsx → resets and rebuilds the whole analog table.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
