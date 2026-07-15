// Recent searches for the Header dropdown (client-side, localStorage).
// Newest first, capped at MAX. Intermediate live-typing states are collapsed:
// adding «фильтр масляный» removes a previously recorded «фильтр».
const KEY = "rival-search-history";
const MAX = 8;

export function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function save(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // localStorage unavailable (private mode etc.) — history is best-effort
  }
}

export function addSearchHistory(query: string) {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 2) return;
  const low = q.toLowerCase();
  const rest = getSearchHistory().filter((h) => {
    const hl = h.toLowerCase();
    return hl !== low && !low.startsWith(hl); // drop dupes and typed prefixes
  });
  save([q, ...rest]);
}

export function removeSearchHistory(query: string) {
  save(getSearchHistory().filter((h) => h !== query));
}
