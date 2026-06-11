"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  CheckCircle2,
  Percent,
  Lock,
  RefreshCw,
  Tags,
  Timer,
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
  const [discountDisplay, setDiscountDisplay] = useState("percent");
  const [autoBlockDays, setAutoBlockDays] = useState("30");
  const [newBadgeDays, setNewBadgeDays] = useState("40");
  const [priceDropDays, setPriceDropDays] = useState("13");
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
        setDiscountDisplay(d.settings?.discount_display ?? "percent");
        setAutoBlockDays(d.settings?.auto_block_days ?? "30");
        setNewBadgeDays(d.settings?.new_badge_days ?? "40");
        setPriceDropDays(d.settings?.price_drop_days ?? "13");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const days = (v: string) =>
    String(Math.max(0, Math.min(3650, parseInt(v) || 0)));

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
            discount_display:
              discountDisplay === "amount" ? "amount" : "percent",
            auto_block_days: days(autoBlockDays),
            new_badge_days: days(newBadgeDays),
            price_drop_days: days(priceDropDays),
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

      {/* Discount display mode */}
      <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
          <Tags size={15} className="text-accent" /> Отображение скидки на
          карточках
        </h2>
        <p className="mb-3 text-xs text-muted">
          Как показывать плашку скидки клиентам: в процентах или суммой в тенге.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setDiscountDisplay("percent")}
            className={
              discountDisplay === "percent"
                ? "flex items-center gap-1.5 rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent"
                : "flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-accent/40"
            }
          >
            Проценты&nbsp;
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              −15%
            </span>
          </button>
          <button
            onClick={() => setDiscountDisplay("amount")}
            className={
              discountDisplay === "amount"
                ? "flex items-center gap-1.5 rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent"
                : "flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-accent/40"
            }
          >
            Сумма&nbsp;
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              −1 500 ₸
            </span>
          </button>
        </div>
      </div>

      {/* Automation timers */}
      <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
          <Timer size={15} className="text-accent" /> Автоматизация
        </h2>
        <p className="mb-3 text-xs text-muted">
          Сроки в днях. 0 — отключить правило.
        </p>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-ink">
                Автоблокировка должника
              </div>
              <div className="text-[11px] text-muted">
                Клиент блокируется, если долг (минусовой баланс) держится дольше
                указанного срока. Погашение долга сбрасывает отсчёт.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                value={autoBlockDays}
                onChange={(e) => setAutoBlockDays(e.target.value)}
                className="input w-20 text-center"
              />
              <span className="text-xs text-muted">дн.</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <div>
              <div className="text-sm font-medium text-ink">
                Значок «Новинка» для новых товаров
              </div>
              <div className="text-[11px] text-muted">
                Товар, впервые появившийся в 1С, носит значок указанное число
                дней.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                value={newBadgeDays}
                onChange={(e) => setNewBadgeDays(e.target.value)}
                className="input w-20 text-center"
              />
              <span className="text-xs text-muted">дн.</span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <div>
              <div className="text-sm font-medium text-ink">
                Скидка при снижении цены в 1С
              </div>
              <div className="text-[11px] text-muted">
                Зачёркнутая цена и плашка скидки показываются указанное число
                дней после снижения.
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                type="number"
                value={priceDropDays}
                onChange={(e) => setPriceDropDays(e.target.value)}
                className="input w-20 text-center"
              />
              <span className="text-xs text-muted">дн.</span>
            </div>
          </div>
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
