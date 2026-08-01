import { syncFromOneC, type SyncResult } from "./onec";
import { invalidatePrefix } from "./cache";

// Shared runner + in-memory state so manual (/api/sync) and scheduled
// (instrumentation cron) syncs coordinate and never overlap. State lives on
// globalThis to survive dev hot-reloads.

export type SyncTrigger = "manual" | "auto";

export type SyncState = {
  running: boolean;
  lastRunAt: string | null;
  lastTrigger: SyncTrigger | null;
  lastResult: SyncResult | null;
};

const g = globalThis as unknown as { __rivalSyncState?: SyncState };
g.__rivalSyncState ??= {
  running: false,
  lastRunAt: null,
  lastTrigger: null,
  lastResult: null,
};

export function getSyncState(): SyncState {
  return g.__rivalSyncState as SyncState;
}

export async function runSync(trigger: SyncTrigger): Promise<SyncResult> {
  const state = getSyncState();
  if (state.running) {
    return {
      ok: false,
      fetched: 0,
      productsUpserted: 0,
      warehousesUpserted: 0,
      stocksUpserted: 0,
      stocksRemoved: 0,
      productsRemoved: 0,
      durationMs: 0,
      error: "Синхронизация уже выполняется",
    };
  }
  state.running = true;
  state.lastTrigger = trigger;
  try {
    const result = await syncFromOneC();
    state.lastResult = result;
    state.lastRunAt = new Date().toISOString();
    // Catalog facets (filters/models) are cached — refresh them after a sync.
    if (result.ok) invalidatePrefix("catalog:");
    return result;
  } finally {
    state.running = false;
  }
}
