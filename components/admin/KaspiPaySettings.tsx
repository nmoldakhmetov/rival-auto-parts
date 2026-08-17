"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  Link2Off,
  TriangleAlert,
} from "lucide-react";

type State = {
  hasKey: boolean;
  keyKind: "prod" | "test" | "unknown" | null;
  apiUrl: string;
  connected: boolean;
  tradePointId: string | null;
  tradePoints: { id: number; name: string }[];
  error: string | null;
};

// Подключение онлайн-оплаты Kaspi Pay.
//
// Ключ доступа (Api-Key) банк выдаёт организации, и живёт он только в
// переменных окружения сервера — в этом разделе его не видно и не ввести.
// Здесь выбирается торговая точка: сайт регистрируется в ней как «устройство»
// и получает токен, которым потом подписываются платежи.
export default function KaspiPaySettings() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tradePoint, setTradePoint] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/kaspi")
      .then((r) => r.json())
      .then((d: State) => {
        setState(d);
        setTradePoint(d.tradePointId ?? String(d.tradePoints[0]?.id ?? ""));
      })
      .catch(() => setError("Не удалось получить состояние Kaspi Pay"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/kaspi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradePointId: Number(tradePoint) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Не удалось подключить");
      else load();
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/admin/kaspi", { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
        <CreditCard size={15} className="text-accent" /> Оплата Kaspi Pay
      </h2>
      <p className="mb-3 text-xs text-muted">
        Клиент оплачивает заказ сразу при оформлении: на телефоне — переходом в
        приложение Kaspi, на компьютере — сканированием QR. Пока точка не
        подключена, у клиентов остаются только наличные и перевод.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Loader2 size={14} className="animate-spin" /> Проверяем подключение…
        </div>
      ) : !state?.hasKey ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <TriangleAlert size={13} /> Ключ доступа не задан
          </div>
          Запросите в Kaspi ApiKey для организации и пропишите его на сервере в
          переменной <code className="font-mono">KASPI_API_KEY</code> (боевой
          ключ начинается с <code className="font-mono">prod_</code>), а адрес
          боевого API — в <code className="font-mono">KASPI_API_URL</code>.
          После перезапуска сайта здесь появится выбор торговой точки.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={
                "badge border " +
                (state.connected
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-line bg-gray-50 text-muted")
              }
            >
              {state.connected ? (
                <>
                  <CheckCircle2 size={12} className="mr-1" /> Подключено
                </>
              ) : (
                "Точка не выбрана"
              )}
            </span>
            <span
              className={
                "badge border " +
                (state.keyKind === "prod"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-amber-200 bg-amber-50 text-amber-700")
              }
            >
              {state.keyKind === "prod"
                ? "Боевой ключ"
                : state.keyKind === "test"
                  ? "Тестовый ключ"
                  : "Ключ без префикса"}
            </span>
            <span className="text-muted">{state.apiUrl}</span>
          </div>

          {state.error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Kaspi не ответил: {state.error}
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[240px] flex-1">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Торговая точка
                </span>
                <select
                  value={tradePoint}
                  onChange={(e) => setTradePoint(e.target.value)}
                  className="input"
                  disabled={busy || state.tradePoints.length === 0}
                >
                  {state.tradePoints.length === 0 && (
                    <option value="">Точек нет — создайте в Kaspi Pay</option>
                  )}
                  {state.tradePoints.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={connect}
                disabled={busy || !tradePoint}
                className="btn-accent h-[38px]"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : state.connected ? (
                  "Переподключить"
                ) : (
                  "Подключить"
                )}
              </button>
              {state.connected && (
                <button
                  onClick={disconnect}
                  disabled={busy}
                  title="Клиенты перестанут видеть оплату Kaspi"
                  className="btn-ghost h-[38px]"
                >
                  <Link2Off size={14} /> Отключить
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div className="mt-2 text-xs text-accent">{error}</div>}
    </div>
  );
}
