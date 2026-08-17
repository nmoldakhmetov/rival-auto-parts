import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { invalidatePrefix } from "@/lib/cache";
import {
  KaspiError,
  deleteDevice,
  hasKaspiKey,
  kaspiApiUrl,
  kaspiDeviceToken,
  kaspiKeyKind,
  listTradePoints,
  registerDevice,
} from "@/lib/kaspi";
import { getSetting } from "@/lib/settings";
import { KASPI_TRADE_POINT_KEY } from "@/lib/kaspi";

export const dynamic = "force-dynamic";

// Подключение Kaspi Pay (раздел «Настройки», только владелец).
//
// GET  → состояние: есть ли ключ, тестовый он или боевой, подключена ли
//        торговая точка, список точек для выбора.
// POST { tradePointId } → зарегистрировать сайт как устройство в этой точке.
// DELETE → отключить устройство (оплата у клиентов пропадает).
//
// Сам ключ (Api-Key) живёт ТОЛЬКО в переменных окружения сервера и наружу не
// отдаётся — ни целиком, ни частями.

export async function GET() {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deviceToken = await kaspiDeviceToken();
  const tradePointId = (await getSetting(KASPI_TRADE_POINT_KEY)).trim();

  let tradePoints: { id: number; name: string }[] = [];
  let error: string | null = null;
  if (hasKaspiKey()) {
    try {
      tradePoints = await listTradePoints();
    } catch (e) {
      error = e instanceof KaspiError ? e.message : "Kaspi недоступен";
    }
  }

  return NextResponse.json({
    hasKey: hasKaspiKey(),
    keyKind: kaspiKeyKind(),
    apiUrl: kaspiApiUrl(),
    connected: deviceToken.length > 0,
    tradePointId: tradePointId || null,
    tradePoints,
    error,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { tradePointId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const tradePointId = Number(body.tradePointId);
  if (!Number.isFinite(tradePointId) || tradePointId <= 0) {
    return NextResponse.json(
      { error: "Выберите торговую точку" },
      { status: 400 }
    );
  }

  try {
    await registerDevice(tradePointId);
  } catch (e) {
    console.warn("[kaspi] регистрация устройства:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: e instanceof KaspiError ? e.message : "Не удалось подключить" },
      { status: 502 }
    );
  }

  // Флаг «оплата доступна» читается из настроек и кэшируется под cfg:.
  invalidatePrefix("cfg:");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await deleteDevice();
  invalidatePrefix("cfg:");
  return NextResponse.json({ ok: true });
}
