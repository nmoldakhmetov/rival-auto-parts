import { NextRequest, NextResponse } from "next/server";
import { getSettings, setSetting, DEFAULTS } from "@/lib/settings";
import { applySyncSchedule } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings(Object.keys(DEFAULTS));
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  let body: { settings?: Record<string, unknown>; key?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  let syncChanged = false;
  if (body.settings && typeof body.settings === "object") {
    for (const [k, v] of Object.entries(body.settings)) {
      if (k in DEFAULTS) {
        await setSetting(k, String(v ?? ""));
        if (k === "sync_cron") syncChanged = true;
      }
    }
  } else if (body.key && body.key in DEFAULTS) {
    await setSetting(body.key, String(body.value ?? ""));
    if (body.key === "sync_cron") syncChanged = true;
  }

  // Re-arm the in-process auto-sync scheduler with the new interval.
  let schedule = null;
  if (syncChanged) schedule = await applySyncSchedule().catch(() => null);

  return NextResponse.json({ ok: true, schedule });
}
