import { NextRequest, NextResponse } from "next/server";
import { getSettings, setSetting, DEFAULTS } from "@/lib/settings";
import { applySyncSchedule } from "@/lib/scheduler";
import { invalidatePrefix } from "@/lib/cache";

export const dynamic = "force-dynamic";

// Токен устройства Kaspi форме настроек не нужен, а по сети лишний раз ходить
// ему незачем: подключением занимается отдельный раздел (/api/admin/kaspi).
const HIDDEN_KEYS = ["kaspi_device_token", "kaspi_trade_point"];

export async function GET() {
  const settings = await getSettings(
    Object.keys(DEFAULTS).filter((k) => !HIDDEN_KEYS.includes(k))
  );
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
  let discountChanged = false;
  if (body.settings && typeof body.settings === "object") {
    for (const [k, v] of Object.entries(body.settings)) {
      if (k in DEFAULTS) {
        await setSetting(k, String(v ?? ""));
        if (k === "sync_cron") syncChanged = true;
        if (k === "global_discount") discountChanged = true;
      }
    }
  } else if (body.key && body.key in DEFAULTS) {
    await setSetting(body.key, String(body.value ?? ""));
    if (body.key === "sync_cron") syncChanged = true;
    if (body.key === "global_discount") discountChanged = true;
  }

  // Discount contexts are cached per user for 30 s in the search route.
  if (discountChanged) invalidatePrefix("disc:");
  // Display/automation knobs are cached under cfg: — refresh immediately.
  invalidatePrefix("cfg:");

  // Re-arm the in-process auto-sync scheduler with the new interval.
  let schedule = null;
  if (syncChanged) schedule = await applySyncSchedule().catch(() => null);

  return NextResponse.json({ ok: true, schedule });
}
