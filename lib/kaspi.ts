import "server-only";
import { randomUUID } from "crypto";
import { getSetting, setSetting } from "@/lib/settings";

// ─────────────────────────────────────────────────────────────────────────
//  Kaspi QR API — приём оплаты от клиента (документация Kaspi v3.9.3).
//
//  Работаем по ПЕРВОЙ схеме («облегчённый доступ»): авторизация ключом в
//  заголовке Api-Key, возвраты — в приложении Kaspi Pay кассиром. Схемы с
//  клиентским сертификатом (mTLS) требуют выпуска сертификата на 5 лет и
//  статического IP; для приёма оплаты они ничего не добавляют.
//
//  Ключ и адрес живут в окружении и НЕ попадают в git:
//    KASPI_API_URL   — база API (тест: https://mtokentest.kaspi.kz:8543,
//                      боевой адрес банк присылает вместе с prod-ключом)
//    KASPI_API_KEY   — ключ организации (test_… / prod_…)
//    KASPI_DEVICE_ID — как называется наша «касса» в Kaspi Pay
//
//  DeviceToken выдаётся один раз при подключении торговой точки и лежит в
//  настройках (Setting kaspi_device_token) — его получают в админке.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_API_URL = "https://mtokentest.kaspi.kz:8543";
// Все методы первой схемы живут под /r1; статус покупки — во второй версии.
const V01 = "/r1/v01";
const V02 = "/r1/v02";

export const KASPI_DEVICE_TOKEN_KEY = "kaspi_device_token";
export const KASPI_TRADE_POINT_KEY = "kaspi_trade_point";

export type KaspiStatus = "QrTokenCreated" | "Wait" | "Processed" | "Error";

export type KaspiCreated = {
  paymentId: string; // QrPaymentId / PaymentId (Int64 — держим строкой)
  qrToken?: string; // содержимое QR-кода (режим «QR»)
  paymentLink?: string; // ссылка в приложение Kaspi (режим «ссылка»)
  expireDate: string | null;
  paymentMethods: string[];
  // Тайминги приходят от Kaspi и задают поведение экрана оплаты.
  statusPollingInterval: number;
  activationTimeout: number; // сканирование QR / переход по ссылке
  confirmationTimeout: number; // подтверждение оплаты клиентом
};

export type KaspiStatusInfo = {
  status: KaspiStatus;
  transactionId: string | null;
  productType: string | null;
  amount: number | null;
};

export function kaspiApiUrl(): string {
  return (process.env.KASPI_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

function apiKey(): string {
  return (process.env.KASPI_API_KEY || "").trim();
}

/** Ключ задан — с API можно разговаривать (устройство подключается отдельно). */
export function hasKaspiKey(): boolean {
  return apiKey().length > 0;
}

/** Боевой ключ или тестовый — показываем это в админке, чтобы не путаться. */
export function kaspiKeyKind(): "prod" | "test" | "unknown" | null {
  const k = apiKey();
  if (!k) return null;
  if (k.startsWith("prod_")) return "prod";
  if (k.startsWith("test_")) return "test";
  return "unknown";
}

export async function kaspiDeviceToken(): Promise<string> {
  return (await getSetting(KASPI_DEVICE_TOKEN_KEY)).trim();
}

/** Оплата доступна клиенту: есть и ключ, и подключённое устройство. */
export async function kaspiReady(): Promise<boolean> {
  return hasKaspiKey() && (await kaspiDeviceToken()).length > 0;
}

// Ошибка Kaspi с кодом: код нужен и в логе, и для понятного текста клиенту.
export class KaspiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null = null
  ) {
    super(message);
    this.name = "KaspiError";
  }
}

// Расшифровки кодов из Приложения 3 — в лог и менеджеру, клиенту показываем
// человеческий текст.
const STATUS_TEXT: Record<number, string> = {
  [-999]: "Сервис Kaspi временно недоступен",
  [-1501]: "Устройство не найдено в Kaspi Pay",
  [-1502]: "Устройство отключено или удалено",
  [-1503]: "Устройство уже добавлено в другую торговую точку",
  [-1601]: "Покупка не найдена",
  [-10000]: "Kaspi не принял ключ доступа",
  [-14000002]: "В Kaspi Pay нет ни одной торговой точки",
  [-99000002]: "Торговая точка не найдена",
  [990000018]: "Торговая точка отключена",
  [990000026]: "Торговая точка не принимает оплату по QR",
  [990000028]: "Kaspi не принял сумму операции",
  [990000033]: "Нет доступных методов оплаты",
};

async function call<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown }
): Promise<T> {
  if (!hasKaspiKey()) {
    throw new KaspiError("Kaspi Pay не настроен: нет ключа доступа");
  }

  const url = `${kaspiApiUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey(),
        // Каждый запрос помечается своим идентификатором — так требует Kaspi
        // и так их поддержка находит нашу операцию в своих логах.
        "X-Request-ID": randomUUID().replace(/-/g, ""),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      // 20 с: столько же ждём 1С. Оплата — интерактивный сценарий, дольше
      // держать клиента перед пустым экраном нельзя.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new KaspiError(
      `Не удалось связаться с Kaspi: ${e instanceof Error ? e.message : e}`
    );
  }

  if (!res.ok) {
    throw new KaspiError(`Kaspi ответил ${res.status}`, null);
  }

  const json = (await res.json().catch(() => null)) as {
    StatusCode?: number;
    Message?: string;
    Data?: T;
  } | null;

  if (!json || typeof json.StatusCode !== "number") {
    throw new KaspiError("Kaspi вернул неожиданный ответ");
  }
  if (json.StatusCode !== 0) {
    const code = json.StatusCode;
    throw new KaspiError(
      STATUS_TEXT[code] ?? json.Message ?? `Ошибка Kaspi ${code}`,
      code
    );
  }
  return json.Data as T;
}

/** Торговые точки организации — из них выбирают ту, к которой цепляем сайт. */
export async function listTradePoints(): Promise<
  { id: number; name: string }[]
> {
  const data = await call<{ TradePointId: number; TradePointName: string }[]>(
    `${V01}/partner/tradepoints`
  );
  return (data ?? []).map((t) => ({
    id: t.TradePointId,
    name: t.TradePointName,
  }));
}

/**
 * Регистрация сайта как «устройства» в выбранной торговой точке. Повторный
 * вызов с теми же аргументами возвращает тот же токен, так что операция
 * безопасна при повторе.
 */
export async function registerDevice(tradePointId: number): Promise<string> {
  // Только латиница, цифры, тире и подчёркивание — требование Kaspi.
  const deviceId = (process.env.KASPI_DEVICE_ID || "rival-auto-site")
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .slice(0, 64);
  const data = await call<{ DeviceToken: string }>(`${V01}/device/register`, {
    method: "POST",
    body: { DeviceId: deviceId, TradePointId: tradePointId },
  });
  const token = data?.DeviceToken ?? "";
  if (!token) throw new KaspiError("Kaspi не вернул токен устройства");
  await setSetting(KASPI_DEVICE_TOKEN_KEY, token);
  await setSetting(KASPI_TRADE_POINT_KEY, String(tradePointId));
  return token;
}

export async function deleteDevice(): Promise<void> {
  const token = await kaspiDeviceToken();
  if (token) {
    await call(`${V01}/device/delete`, {
      method: "POST",
      body: { DeviceToken: token },
    }).catch(() => {
      // Отключение на нашей стороне важнее ответа Kaspi: устройство могли
      // удалить в приложении, и тогда метод отвечает ошибкой.
    });
  }
  await setSetting(KASPI_DEVICE_TOKEN_KEY, "");
  await setSetting(KASPI_TRADE_POINT_KEY, "");
}

type CreateResponse = {
  QrToken?: string;
  PaymentLink?: string;
  ExpireDate?: string;
  QrPaymentId?: number;
  PaymentId?: number;
  PaymentMethods?: string[];
  QrPaymentBehaviorOptions?: {
    StatusPollingInterval?: number;
    QrCodeScanWaitTimeout?: number;
    PaymentConfirmationTimeout?: number;
  };
  PaymentBehaviorOptions?: {
    StatusPollingInterval?: number;
    LinkActivationWaitTimeout?: number;
    PaymentConfirmationTimeout?: number;
  };
};

function normalizeCreated(d: CreateResponse): KaspiCreated {
  const qrOpts = d.QrPaymentBehaviorOptions;
  const linkOpts = d.PaymentBehaviorOptions;
  return {
    paymentId: String(d.QrPaymentId ?? d.PaymentId ?? ""),
    qrToken: d.QrToken,
    paymentLink: d.PaymentLink,
    expireDate: d.ExpireDate ?? null,
    paymentMethods: d.PaymentMethods ?? [],
    statusPollingInterval:
      qrOpts?.StatusPollingInterval ?? linkOpts?.StatusPollingInterval ?? 5,
    activationTimeout:
      qrOpts?.QrCodeScanWaitTimeout ?? linkOpts?.LinkActivationWaitTimeout ?? 180,
    confirmationTimeout:
      qrOpts?.PaymentConfirmationTimeout ??
      linkOpts?.PaymentConfirmationTimeout ??
      65,
  };
}

/**
 * Создание покупки. `mode`:
 *  • "qr"   — QR-токен: рисуем QR на экране, клиент сканирует телефоном;
 *  • "link" — ссылка: на телефоне открывает приложение Kaspi сразу.
 * Каждый вызов создаёт НОВУЮ покупку в Kaspi, поэтому режим выбирается до
 * создания, а не после.
 */
export async function createPayment(
  mode: "qr" | "link",
  amount: number,
  externalId: string
): Promise<KaspiCreated> {
  const deviceToken = await kaspiDeviceToken();
  if (!deviceToken) {
    throw new KaspiError("Kaspi Pay не подключён: нет торговой точки");
  }
  const data = await call<CreateResponse>(
    `${V01}/qr/${mode === "qr" ? "create" : "create-link"}`,
    {
      method: "POST",
      body: {
        DeviceToken: deviceToken,
        Amount: Number(amount.toFixed(2)),
        ExternalId: externalId,
      },
    }
  );
  const created = normalizeCreated(data ?? {});
  if (!created.paymentId) {
    throw new KaspiError("Kaspi не вернул идентификатор покупки");
  }
  return created;
}

/** Текущий статус покупки. Опрашивается до конечного статуса. */
export async function paymentStatus(
  paymentId: string
): Promise<KaspiStatusInfo> {
  const data = await call<{
    Status?: string;
    TransactionId?: string;
    ProductType?: string;
    Amount?: number;
  }>(`${V02}/payment/status/${encodeURIComponent(paymentId)}`);

  const status = (data?.Status ?? "Error") as KaspiStatus;
  return {
    status,
    transactionId: data?.TransactionId ?? null,
    productType: data?.ProductType ?? null,
    amount: typeof data?.Amount === "number" ? data.Amount : null,
  };
}

/** Конечные статусы: дальше опрашивать нечего. */
export function isFinalStatus(s: KaspiStatus): boolean {
  return s === "Processed" || s === "Error";
}
