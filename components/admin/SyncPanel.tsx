"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  CalendarClock,
  Image as ImageIcon,
  Download,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";

type SyncResult = {
  ok: boolean;
  fetched: number;
  productsUpserted: number;
  warehousesUpserted: number;
  stocksUpserted: number;
  durationMs: number;
  error?: string;
};

type Status = {
  state: {
    running: boolean;
    lastRunAt: string | null;
    lastTrigger: "manual" | "auto" | null;
    lastResult: SyncResult | null;
  };
  schedule: {
    enabled: boolean;
    expr: string;
    active: boolean;
    nextRun: string | null;
  };
};

function humanCron(expr: string): string {
  const map: Record<string, string> = {
    "*/5 * * * *": "каждые 5 минут",
    "*/15 * * * *": "каждые 15 минут",
    "*/30 * * * *": "каждые 30 минут",
    "0 * * * *": "каждый час",
    "0 */2 * * *": "каждые 2 часа",
    "0 0 * * *": "ежедневно в 00:00",
  };
  return map[expr] || expr;
}

export default function SyncPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [manualResult, setManualResult] = useState<SyncResult | null>(null);
  const [imgStats, setImgStats] = useState<{
    cached: number;
    withImage: number;
  } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgResult, setImgResult] = useState<{
    cached: number;
    skipped: number;
    failed: number;
    total: number;
    aborted: boolean;
    error?: string;
  } | null>(null);

  const loadStatus = useCallback(() => {
    fetch("/api/sync/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => {});
  }, []);

  const loadImgStats = useCallback(() => {
    fetch("/api/sync/images")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setImgStats(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
    loadImgStats();
    const id = setInterval(loadStatus, 15000);
    return () => clearInterval(id);
  }, [loadStatus, loadImgStats]);

  async function runManual() {
    setLoading(true);
    setManualResult(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data: SyncResult = await res.json();
      setManualResult(data);
      if (data.ok) router.refresh();
    } catch {
      setManualResult({
        ok: false,
        fetched: 0,
        productsUpserted: 0,
        warehousesUpserted: 0,
        stocksUpserted: 0,
        durationMs: 0,
        error: "Сервер недоступен",
      });
    } finally {
      setLoading(false);
      loadStatus();
    }
  }

  async function prefetchImages() {
    setImgLoading(true);
    setImgResult(null);
    try {
      const res = await fetch("/api/sync/images", { method: "POST" });
      const data = await res.json();
      setImgResult(data);
    } catch {
      setImgResult({
        cached: 0,
        skipped: 0,
        failed: 0,
        total: 0,
        aborted: true,
        error: "Сервер недоступен",
      });
    } finally {
      setImgLoading(false);
      loadImgStats();
    }
  }

  const sched = status?.schedule;
  const st = status?.state;
  const auto = !!(sched?.enabled && sched.active);
  const busy = loading || !!st?.running;

  return (
    <div>
      {/* Auto-sync status */}
      <div className="mb-3 space-y-1.5 rounded border border-line bg-gray-50 px-3 py-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <CalendarClock size={13} /> Авто-синхронизация
          </span>
          <span
            className={`badge ${
              auto ? "bg-green-100 text-green-700" : "bg-gray-200 text-muted"
            }`}
          >
            {status ? (auto ? "включена" : "выключена") : "…"}
          </span>
        </div>

        {auto && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted">Расписание</span>
              <span className="font-medium text-ink">
                {humanCron(sched!.expr)}
              </span>
            </div>
            {sched!.nextRun && (
              <div className="flex items-center justify-between">
                <span className="text-muted">Следующий запуск</span>
                <span className="font-medium text-ink">
                  {formatDateTime(sched!.nextRun)}
                </span>
              </div>
            )}
          </>
        )}

        <div className="flex items-center justify-between border-t border-line pt-1.5">
          <span className="text-muted">Последняя</span>
          {st?.lastRunAt ? (
            <span className="text-ink">
              {formatDateTime(st.lastRunAt)} ·{" "}
              {st.lastTrigger === "auto" ? "авто" : "вручную"}{" "}
              {st.lastResult?.ok ? (
                <span className="text-green-700">
                  (+{st.lastResult.productsUpserted})
                </span>
              ) : (
                <span className="text-accent">ошибка</span>
              )}
            </span>
          ) : (
            <span className="text-muted">ещё не запускалась</span>
          )}
        </div>
      </div>

      {/* Manual trigger */}
      <button onClick={runManual} disabled={busy} className="btn-accent">
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <RefreshCw size={16} />
        )}
        {st?.running && !loading
          ? "Идёт синхронизация…"
          : loading
            ? "Синхронизация…"
            : "Синхронизировать сейчас"}
      </button>

      {manualResult && (
        <div
          className={`mt-3 rounded border px-3 py-2 text-xs ${
            manualResult.ok
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-accent/30 bg-accent/5 text-accent-dark"
          }`}
        >
          {manualResult.ok ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              <span>
                Готово за {manualResult.durationMs} мс · получено{" "}
                {manualResult.fetched} · товаров {manualResult.productsUpserted}{" "}
                · складов {manualResult.warehousesUpserted} · остатков{" "}
                {manualResult.stocksUpserted}
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <XCircle size={14} className="mt-0.5 shrink-0" />
              <span>Ошибка: {manualResult.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Image cache */}
      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted">
            <ImageIcon size={13} /> Кэш фотографий
          </span>
          {imgStats && (
            <span className="font-medium text-ink">
              {imgStats.cached} из {imgStats.withImage}
            </span>
          )}
        </div>
        <button
          onClick={prefetchImages}
          disabled={imgLoading}
          className="btn-ghost w-full text-xs"
        >
          {imgLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {imgLoading ? "Загрузка фото из 1С…" : "Загрузить все фото в кэш"}
        </button>
        {imgResult && (
          <div
            className={`mt-2 rounded border px-3 py-2 text-[11px] ${
              imgResult.aborted
                ? "border-accent/30 bg-accent/5 text-accent-dark"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            {imgResult.aborted ? (
              <span>{imgResult.error}</span>
            ) : (
              <span>
                Готово: загружено {imgResult.cached}, уже в кэше{" "}
                {imgResult.skipped}, не удалось {imgResult.failed} (из{" "}
                {imgResult.total}).
              </span>
            )}
          </div>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Скачивает фото из 1С на сервер. Раз загруженные показываются даже когда
          1С недоступен. Может занять время.
        </p>
      </div>
    </div>
  );
}
