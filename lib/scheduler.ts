import cron, { type ScheduledTask } from "node-cron";
import { runSync } from "./sync-runner";
import { getSetting } from "./settings";
import { prefetchAllImages } from "./image-cache";
import { runMaintenance } from "./maintenance";

const DEFAULT_CRON = "*/30 * * * *"; // every 30 minutes

const g = globalThis as unknown as {
  __rivalCronTask?: ScheduledTask;
  __rivalCronExpr?: string;
  __rivalMaintTask?: ScheduledTask;
};

export function getScheduleInfo() {
  const enabled = process.env.SYNC_ENABLED === "true";
  const expr = g.__rivalCronExpr || process.env.SYNC_CRON || DEFAULT_CRON;
  let nextRun: string | null = null;
  try {
    const d = g.__rivalCronTask?.getNextRun?.();
    nextRun = d ? d.toISOString() : null;
  } catch {
    nextRun = null;
  }
  return { enabled, expr, active: !!g.__rivalCronTask, nextRun };
}

// (Re)build the cron task from the current DB setting (sync_cron). Safe to call
// repeatedly — it tears down any existing task first. Returns the active state.
export async function applySyncSchedule(): Promise<{
  active: boolean;
  expr: string | null;
}> {
  if (g.__rivalCronTask) {
    try {
      g.__rivalCronTask.stop();
    } catch {
      // ignore
    }
    g.__rivalCronTask = undefined;
    g.__rivalCronExpr = undefined;
  }

  if (process.env.SYNC_ENABLED !== "true") {
    console.log("[1c-sync] авто-синхронизация выключена (SYNC_ENABLED!=true)");
    return { active: false, expr: null };
  }

  // DB setting wins (admin-adjustable); "off" disables; fall back to env.
  let expr = (await getSetting("sync_cron").catch(() => "")) || "";
  if (expr === "off") {
    console.log("[1c-sync] авто-синхронизация отключена в настройках");
    return { active: false, expr: null };
  }
  if (!cron.validate(expr)) expr = process.env.SYNC_CRON || DEFAULT_CRON;
  if (!cron.validate(expr)) {
    console.warn(`[1c-sync] некорректное расписание "${expr}" — не запущено`);
    return { active: false, expr: null };
  }

  g.__rivalCronTask = cron.schedule(
    expr,
    async () => {
      const r = await runSync("auto");
      console.log(
        `[1c-sync] авто-синхронизация: ${
          r.ok
            ? `ok — товаров ${r.productsUpserted}, остатков ${r.stocksUpserted} за ${r.durationMs}мс`
            : "ошибка: " + r.error
        }`
      );
      // Warm the on-disk photo cache (best-effort; skips already-cached).
      if (r.ok) {
        prefetchAllImages()
          .then((p) =>
            console.log(
              `[1c-sync] фото: загружено ${p.cached}, пропущено ${p.skipped}, ошибок ${p.failed}${
                p.aborted ? " (прервано)" : ""
              }`
            )
          )
          .catch(() => {});
      }
    },
    { name: "rival-1c-sync", noOverlap: true }
  );
  g.__rivalCronExpr = expr;

  console.log(`[1c-sync] авто-синхронизация запущена по расписанию "${expr}"`);
  return { active: true, expr };
}

// Housekeeping (auto-block of debtors, discount/badge expiry) runs on its own
// fixed schedule, independent of the 1С sync being on or off.
function startMaintenance() {
  if (g.__rivalMaintTask) return;
  const tick = async () => {
    try {
      const r = await runMaintenance();
      if (r.blocked || r.dropsExpired || r.debtMarked) {
        console.log(
          `[maintenance] блокировок: ${r.blocked}, долг отмечен: ${r.debtMarked}, ` +
            `скидок снято: ${r.dropsExpired}, новинок снято: ${r.newExpired}`
        );
      }
    } catch (e) {
      console.warn("[maintenance] ошибка:", e instanceof Error ? e.message : e);
    }
  };
  g.__rivalMaintTask = cron.schedule("*/10 * * * *", tick, {
    name: "rival-maintenance",
    noOverlap: true,
  });
  void tick(); // run once at startup
  console.log("[maintenance] фоновые проверки запущены (каждые 10 минут)");
}

export function startSyncScheduler() {
  // Fire-and-forget at server start (instrumentation hook).
  void applySyncSchedule();
  startMaintenance();
}
