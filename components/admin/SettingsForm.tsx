"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  CheckCircle2,
  Percent,
  Lock,
  RefreshCw,
} from "lucide-react";

const SYNC_PRESETS: { value: string; label: string }[] = [
  { value: "*/5 * * * *", label: "Каждые 5 минут" },
  { value: "*/10 * * * *", label: "Каждые 10 минут" },
  { value: "*/15 * * * *", label: "Каждые 15 минут" },
  { value: "*/30 * * * *", label: "Каждые 30 минут" },
  { value: "0 * * * *", label: "Каждый час" },
  { value: "0 */3 * * *", label: "Каждые 3 часа" },
  { value: "off", label: "Отключить авто-синхронизацию" },
];

export default function SettingsForm() {
  const [blockedMessage, setBlockedMessage] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState("0");
  const [syncCron, setSyncCron] = useState("*/30 * * * *");
  const [customCron, setCustomCron] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setBlockedMessage(d.settings?.blocked_message ?? "");
        setGlobalDiscount(d.settings?.global_discount ?? "0");
        const cron = d.settings?.sync_cron ?? "*/30 * * * *";
        setSyncCron(cron);
        setCustomCron(!SYNC_PRESETS.some((p) => p.value === cron));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            blocked_message: blockedMessage,
            global_discount: String(
              Math.max(0, Math.min(95, parseInt(globalDiscount) || 0))
            ),
            sync_cron: syncCron.trim() || "*/30 * * * *",
          },
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Loader2 size={18} className="animate-spin text-muted" />;
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Global discount */}
      <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
          <Percent size={15} className="text-accent" /> Глобальная скидка для
          всех клиентов
        </h2>
        <p className="mb-3 text-xs text-muted">
          Применяется ко всем клиентам. Если у клиента есть личная скидка —
          берётся большая из двух. Снижение цены при синхронизации с 1С
          суммируется сверху.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={globalDiscount}
            onChange={(e) => setGlobalDiscount(e.target.value)}
            className="input w-28"
          />
          <span className="text-sm text-muted">%</span>
        </div>
      </div>

      {/* Auto-sync interval */}
      <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
          <RefreshCw size={15} className="text-accent" /> Интервал
          авто-синхронизации с 1С
        </h2>
        <p className="mb-3 text-xs text-muted">
          Как часто портал подтягивает товары, цены, остатки и фотографии из 1С.
          Применяется сразу после сохранения.
        </p>
        <select
          value={customCron ? "custom" : syncCron}
          onChange={(e) => {
            if (e.target.value === "custom") {
              setCustomCron(true);
            } else {
              setCustomCron(false);
              setSyncCron(e.target.value);
            }
          }}
          className="input"
        >
          {SYNC_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="custom">Другое (cron-выражение)…</option>
        </select>
        {customCron && (
          <div className="mt-2">
            <input
              value={syncCron}
              onChange={(e) => setSyncCron(e.target.value)}
              placeholder="*/30 * * * *"
              className="input font-mono text-sm"
            />
            <p className="mt-1 text-[11px] text-muted">
              Формат cron: «минута час день месяц день_недели». Например,
              «*/20 * * * *» — каждые 20 минут.
            </p>
          </div>
        )}
      </div>

      {/* Block message */}
      <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
          <Lock size={15} className="text-accent" /> Текст при блокировке клиента
        </h2>
        <p className="mb-3 text-xs text-muted">
          Показывается заблокированному клиенту поверх сайта (вместе с контактами
          его менеджера).
        </p>
        <textarea
          value={blockedMessage}
          onChange={(e) => setBlockedMessage(e.target.value)}
          rows={3}
          className="input resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-accent">
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Сохранить настройки
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 size={14} /> Сохранено
          </span>
        )}
      </div>
    </div>
  );
}
