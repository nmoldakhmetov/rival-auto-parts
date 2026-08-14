"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

type ClientOpt = { id: string; fullName: string; login: string; city?: string | null };

// Выбор клиента в «Истории поиска».
//
// Был выпадающий список со ВСЕМИ клиентами: на боевой базе это 650 строк,
// в которых менеджер искал глазами. Теперь это поиск — по названию, логину
// и городу, как в разделе «Скидки»; выбранный клиент показан карточкой с
// крестиком.
export default function ClientSearchFilter({
  clients,
  value,
}: {
  clients: ClientOpt[];
  value: string;
}) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = clients.find((c) => c.id === value) ?? null;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients
      .filter((c) =>
        [c.fullName, c.login, c.city ?? ""].some((f) =>
          f.toLowerCase().includes(q)
        )
      )
      .slice(0, 50);
  }, [clients, term]);

  const totalMatches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return clients.length;
    return clients.filter((c) =>
      [c.fullName, c.login, c.city ?? ""].some((f) => f.toLowerCase().includes(q))
    ).length;
  }, [clients, term]);

  function pick(id: string) {
    setOpen(false);
    setTerm("");
    router.push(id ? `/admin/search-logs?client=${id}` : "/admin/search-logs");
  }

  if (selected) {
    return (
      <div className="inline-flex max-w-full items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">
            {selected.fullName}
          </div>
          <div className="truncate text-[11px] text-muted">
            {selected.login}
            {selected.city ? ` · ${selected.city}` : ""}
          </div>
        </div>
        <button
          onClick={() => pick("")}
          title="Показать всех пользователей"
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Поиск клиента: название, логин или город"
        className="input pl-9"
      />
      {open && (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-line bg-white py-1 shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted">
              Никого не нашли по «{term.trim()}»
            </div>
          ) : (
            <>
              {matches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pick(c.id)}
                  className="block w-full px-3 py-2 text-left transition-colors hover:bg-gray-50"
                >
                  <div className="truncate text-sm text-ink">{c.fullName}</div>
                  <div className="truncate text-[11px] text-muted">
                    {c.login}
                    {c.city ? ` · ${c.city}` : ""}
                  </div>
                </button>
              ))}
              {totalMatches > matches.length && (
                <div className="border-t border-line px-3 py-1.5 text-[11px] text-muted">
                  Показаны первые {matches.length} из {totalMatches} — уточните
                  запрос
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
