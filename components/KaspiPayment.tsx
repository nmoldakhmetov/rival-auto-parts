"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTenge } from "@/lib/format";

// Экран онлайн-оплаты Kaspi Pay.
//
// Вид экрана — не наша фантазия: Kaspi выдаёт гайд «Оплата с Kaspi.kz», где
// блок с QR помечен «Обязательно», а состояния (загрузка, ожидание, успех,
// ошибка) — «Рекомендовано». Оттуда же взяты официальные ассеты в
// public/kaspi (их правила прямо запрещают перерисовывать кнопки и логотипы
// самостоятельно). Что требует гайд и что здесь соблюдено:
//   • QR не меньше 200dp, в центре — иконка Kaspi.kz (без неё нельзя),
//     длиной ≥20% стороны кода и со своей зоной безопасности;
//   • внутри блока ничего не менять: ни фон, ни размеры, ни способы оплаты;
//   • кнопка оплаты — официальная, высотой ≥48dp и с ≥8dp свободного места
//     вокруг;
//   • элементы шаблона центрируются по вертикали и горизонтали.
//
// Покупка в Kaspi создаётся ОДНА на попытку, и её вид выбирается до создания:
// на телефоне — ссылка (открывает приложение Kaspi), на компьютере — QR.
// Поэтому переключателя «покажите другой» здесь нет: он породил бы вторую
// покупку на ту же сумму.

type Started = {
  id: string;
  mode: "qr" | "link";
  amount: number;
  qrToken: string | null;
  paymentLink: string | null;
  pollingInterval: number;
  activationTimeout: number;
  confirmationTimeout: number;
};

type Phase = "starting" | "waiting" | "scanned" | "paid" | "failed";

// Сторона QR на экране. Гайд требует не меньше 200dp — берём с запасом,
// чтобы код читался и с недорогой камеры.
const QR_SIZE = 240;
// Иконка Kaspi в центре: 24% стороны кода (минимум по гайду — 20%).
const QR_MARK = Math.round(QR_SIZE * 0.24);

export default function KaspiPayment({
  orderId,
  amount,
  onPaid,
  onGiveUp,
}: {
  orderId: string;
  amount: number;
  onPaid: () => void;
  // Клиент решил не платить онлайн: заказ уже оформлен, дальше по нему
  // работает менеджер.
  onGiveUp: () => void;
}) {
  const [payment, setPayment] = useState<Started | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const deadlineRef = useRef<number | null>(null);

  const start = useCallback(async () => {
    setPhase("starting");
    setError(null);
    setPayment(null);
    // Телефон — ссылка (приложение Kaspi стоит на этом же устройстве),
    // компьютер — QR.
    const mode =
      typeof window !== "undefined" && window.innerWidth < 768 ? "link" : "qr";
    try {
      const res = await fetch("/api/payments/kaspi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, mode }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Не удалось начать оплату");
        setPhase("failed");
        return;
      }
      setPayment(d);
      setPhase("waiting");
      deadlineRef.current = Date.now() + d.activationTimeout * 1000;
    } catch {
      setError("Сервер недоступен");
      setPhase("failed");
    }
  }, [orderId]);

  // Оплата начинается ровно один раз на монтаж экрана. Без этого в dev
  // (StrictMode монтирует дважды) на один заказ заводились две покупки.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
  }, [start]);

  // Опрос статуса — до конечного состояния или до истечения срока.
  useEffect(() => {
    if (!payment || phase === "paid" || phase === "failed") return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/kaspi/${payment.id}`);
        const d = await res.json();
        if (d.paid) {
          setPhase("paid");
          return;
        }
        if (d.status === "Wait" && phase !== "scanned") {
          setPhase("scanned");
          // Второй срок: столько Kaspi ждёт подтверждения оплаты клиентом.
          deadlineRef.current = Date.now() + payment.confirmationTimeout * 1000;
        }
        if (d.status === "Error") {
          setError(d.error ?? "Оплата не завершена");
          setPhase("failed");
        }
      } catch {
        // Молчим: следующая попытка через интервал.
      }
    };
    const id = setInterval(tick, Math.max(2, payment.pollingInterval) * 1000);
    tick();
    return () => clearInterval(id);
  }, [payment, phase]);

  // Обратный отсчёт до текущего срока.
  useEffect(() => {
    if (phase !== "waiting" && phase !== "scanned") {
      setSecondsLeft(null);
      return;
    }
    const id = setInterval(() => {
      if (!deadlineRef.current) return;
      const left = Math.round((deadlineRef.current - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) {
        setError(
          phase === "waiting"
            ? "Время на оплату истекло — QR больше не действителен"
            : "Kaspi не дождался подтверждения оплаты"
        );
        setPhase("failed");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "paid") {
      const t = setTimeout(onPaid, 1600);
      return () => clearTimeout(t);
    }
  }, [phase, onPaid]);

  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ─── Состояния из гайда ────────────────────────────────────────────────

  if (phase === "paid") {
    return (
      <Card>
        <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-[#E8F5D9]">
          <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#8DC63F] text-white">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 12.5l5 5L20 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
        <div className="mt-5 text-xl font-bold text-ink">Оплата принята</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-ink">
          {formatTenge(amount)}
        </div>
      </Card>
    );
  }

  if (phase === "failed") {
    return (
      <>
        <Card>
          <div className="flex h-[104px] w-[104px] items-center justify-center rounded-full bg-gray-100">
            <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-gray-500 text-white">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
          <div className="mt-5 text-xl font-bold text-ink">Отмена покупки</div>
          <p className="mt-1 text-sm text-muted">{error}</p>
        </Card>
        <div className="mx-auto mt-4 max-w-[420px] px-6 text-center">
          <p className="text-xs text-muted">
            Заказ уже оформлен и виден вашему менеджеру — оплатить можно и через
            него.
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button onClick={start} className="btn-accent">
              Попробовать снова
            </button>
            <button onClick={onGiveUp} className="btn-ghost">
              Оплачу через менеджера
            </button>
          </div>
        </div>
      </>
    );
  }

  // Загрузка QR-кода — состояние из набора элементов Kaspi.
  if (phase === "starting" || !payment) {
    return (
      <Card>
        <div className="text-base font-bold text-ink">
          Готовимся к приему оплаты
        </div>
        <Spinner />
      </Card>
    );
  }

  return (
    <>
      <Card>
        {/* Блок Kaspi QR: состав и порядок элементов менять нельзя. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/kaspi/kaspi-qr-lockup.svg"
          alt="Kaspi QR — сканируйте и платите"
          width={143}
          height={60}
        />
        <div className="mt-3 text-[28px] font-bold leading-none tabular-nums text-ink">
          {formatTenge(payment.amount)}
        </div>

        {payment.mode === "qr" ? (
          <div
            className="relative mt-4"
            style={{ width: QR_SIZE, height: QR_SIZE }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/payments/kaspi/${payment.id}/qr`}
              alt="QR-код для оплаты в приложении Kaspi.kz"
              width={QR_SIZE}
              height={QR_SIZE}
            />
            {/* Иконка Kaspi.kz в центре обязательна; она уже идёт со своей
                зоной безопасности, поэтому просто кладём её поверх. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/kaspi/qr-mark.svg"
              alt=""
              width={QR_MARK}
              height={QR_MARK}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          </div>
        ) : (
          <a
            href={payment.paymentLink ?? "#"}
            className="mt-4 block"
            aria-label="Оплатить с Kaspi.kz"
          >
            {/* Официальная кнопка оплаты: перерисовывать её нельзя. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/kaspi/pay-button.svg"
              alt="Оплатить с Kaspi.kz"
              width={343}
              height={52}
              className="h-[52px] w-full max-w-[343px]"
            />
          </a>
        )}

        <div className="mt-4 text-xs text-muted">Способы оплаты</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/kaspi/payment-methods.svg"
          alt="Kaspi Gold, Kaspi Red"
          width={89}
          height={32}
          className="mt-1.5"
        />
      </Card>

      <div className="mx-auto mt-4 max-w-[420px] px-6 text-center">
        <p className="text-sm text-ink">
          {payment.mode === "qr"
            ? "Откройте приложение Kaspi.kz на телефоне и отсканируйте код"
            : "Откроется приложение Kaspi.kz. Вернитесь на эту страницу — она сама покажет, что оплата прошла."}
        </p>
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted">
          <Spinner small />
          {phase === "scanned" ? "Подтвердите оплату в приложении" : "Ждём оплату"}
          {secondsLeft != null && (
            <span className="tabular-nums">· {mmss(secondsLeft)}</span>
          )}
        </div>
        <button
          onClick={onGiveUp}
          className="mt-3 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Оплачу позже через менеджера
        </button>
      </div>
    </>
  );
}

// Карточка шаблона: белая, скруглённая, с тенью — как в наборе элементов
// Kaspi. Содержимое центрируется по обеим осям, как они рекомендуют.
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-8 flex w-[min(320px,calc(100vw-2rem))] flex-col items-center justify-center rounded-[20px] bg-white px-4 py-7 text-center shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
      {children}
    </div>
  );
}

// Фирменный красный лоадер Kaspi (незамкнутое кольцо).
function Spinner({ small }: { small?: boolean }) {
  const size = small ? 14 : 56;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      className={small ? "animate-spin" : "mt-6 animate-spin"}
      aria-hidden
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="#F14635"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="95 30"
      />
    </svg>
  );
}
