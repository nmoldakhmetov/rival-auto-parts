// Tiny in-process TTL cache. Survives dev hot-reloads via globalThis.
// Used to collapse repeated DB round-trips on hot read paths (catalog facets,
// per-user discount context, warehouse access). Values self-expire; writes
// from admin routes call invalidatePrefix() so changes show up immediately.

type Entry = { v: unknown; exp: number };

const g = globalThis as unknown as { __rivalTtlCache?: Map<string, Entry> };
const store = (g.__rivalTtlCache ??= new Map<string, Entry>());

const MAX_ENTRIES = 500;

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return hit.v as T;

  const v = await fn();
  store.set(key, { v, exp: now + ttlMs });

  if (store.size > MAX_ENTRIES) {
    for (const [k, e] of store) if (e.exp <= now) store.delete(k);
    // Still over? Drop oldest insertions.
    for (const k of store.keys()) {
      if (store.size <= MAX_ENTRIES) break;
      store.delete(k);
    }
  }
  return v;
}

export function invalidatePrefix(prefix: string): void {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
