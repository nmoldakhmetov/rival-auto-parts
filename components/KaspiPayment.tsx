"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { formatTenge } from "@/lib/format";

// Экран онлайн-оплаты Kaspi Pay.
//
// Покупка в Kaspi создаётся ОДНА на попытку, и её вид выбирается до создания:
// на телефоне — ссылка (открывает приложение Kaspi), на компьютере — QR
// (клиент сканирует его своим телефоном). Поэтому режим определяется здесь,
// один раз, и переключателя «а покажите другой» нет: он породил бы вторую
// покупку на ту же сумму.
//
// Дальше экран опрашивает статус с интервалом, который вернул Kaspi, и следит
// за двумя сроками из их документации: сколько ждать сканирования/перехода и
// сколько — подтверждения оплаты.

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
          deadlineRef.current =
            Date.now() + payment.confirmationTimeout * 1000;
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
      const t = setTimeout(onPaid, 1200);
      return () => clearTimeout(t);
    }
  }, [phase, onPaid]);

  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (phase === "paid") {
    return (
      <Frame>
        <CheckCircle2 size={44} className="mx-auto mb-2 text-green-600" />
        <h2 className="text-lg font-bold text-ink">Оплачено</h2>
        <p className="mt-1 text-sm text-muted">
          {formatTenge(amount)} получены. Отправляем заказ менеджеру…
        </p>
      </Frame>
    );
  }

  if (phase === "failed") {
    return (
      <Frame>
        <TriangleAlert size={40} className="mx-auto mb-2 text-amber-500" />
        <h2 className="text-lg font-bold text-ink">Оплата не прошла</h2>
        <p className="mt-1 text-sm text-muted">{error}</p>
        <p className="mt-3 text-xs text-muted">
          Заказ уже оформлен и виден вашему менеджеру — оплатить можно и через
          него.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={start} className="btn-accent">
            <RefreshCw size={15} /> Попробовать снова
          </button>
          <button onClick={onGiveUp} className="btn-ghost">
            Оплачу через менеджера
          </button>
        </div>
      </Frame>
    );
  }

  if (phase === "starting" || !payment) {
    return (
      <Frame>
        <Loader2 size={28} className="mx-auto mb-2 animate-spin text-muted" />
        <p className="text-sm text-muted">Готовим оплату…</p>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Оплата через Kaspi
      </div>
      <div className="text-2xl font-bold tabular-nums text-ink">
        {formatTenge(payment.amount)}
      </div>

      {payment.mode === "qr" ? (
        <>
          <div className="mx-auto mt-4 w-[228px] rounded-xl border border-line bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/payments/kaspi/${payment.id}/qr`}
              alt="QR-код для оплаты в приложении Kaspi"
              className="h-[200px] w-[200px]"
            />
          </div>
          <p className="mt-3 text-sm text-ink">
            Откройте приложение <b>Kaspi.kz</b> на телефоне и отсканируйте код
          </p>
        </>
      ) : (
        <>
          <a
            href={payment.paymentLink ?? "#"}
            className="btn mt-4 w-full bg-[#F14635] text-white hover:brightness-95"
          >
            <Smartphone size={18} /> Оплатить в приложении Kaspi
          </a>
          <p className="mt-3 text-sm text-muted">
            Откроется приложение Kaspi.kz. Вернитесь на эту страницу — она сама
            покажет, что оплата прошла.
          </p>
        </>
      )}

      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
        <Loader2 size={13} className="animate-spin" />
        {phase === "scanned"
          ? "Подтвердите оплату в приложении"
          : "Ждём оплату"}
        {secondsLeft != null && (
          <span className="tabular-nums">· {mmss(secondsLeft)}</span>
        )}
      </div>

      <button
        onClick={onGiveUp}
        className="mt-4 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Оплачу позже через менеджера
      </button>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-6 py-10 text-center">
      <div className="rounded-xl border border-line bg-white p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
