"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, CornerDownLeft, X } from "lucide-react";
import { LOCALITIES, LEVEL_LABELS, type GeoNode } from "@/lib/localities";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Cascading locality field: страна → область → населённый пункт, accumulated
// into ONE comma-separated string («Казахстан, Алматинская область, Алматы»),
// which is what User.city stores. Picking a value with children appends a
// comma and immediately offers the next level.
//
// It stays a plain text input: anything missing from the reference tree can
// simply be typed, and the dropdown filters the current level as you type.
//
// The list is rendered position:fixed — the field lives inside a modal with
// overflow-y-auto, which would otherwise clip an absolutely positioned menu.
export default function LocalityPicker({
  value,
  onChange,
  className,
  placeholder = "Начните вводить или выберите из списка",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // "Казахстан, Алматинская область, Алма"
  //   → chosen: ["Казахстан", "Алматинская область"], typed: "Алма"
  const { chosen, typed } = useMemo(() => {
    const parts = value.split(",");
    const tail = (parts.pop() ?? "").trim();
    return { chosen: parts.map((p) => p.trim()).filter(Boolean), typed: tail };
  }, [value]);

  // Walk the tree along the already-chosen segments. An unknown segment (free
  // text) simply ends the guidance — the field keeps working as plain input.
  const options = useMemo(() => {
    let level: GeoNode[] = LOCALITIES;
    for (const seg of chosen) {
      const node = level.find(
        (n) => n.name.toLowerCase() === seg.toLowerCase()
      );
      if (!node?.children?.length) return [];
      level = node.children;
    }
    const q = typed.toLowerCase();
    return q
      ? level.filter((n) => n.name.toLowerCase().includes(q))
      : level;
  }, [chosen, typed]);

  const place = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  function pick(node: GeoNode) {
    const path = [...chosen, node.name];
    const hasChildren = !!node.children?.length;
    onChange(path.join(", ") + (hasChildren ? ", " : ""));
    if (!hasChildren) setOpen(false);
    inputRef.current?.focus();
  }

  // Drop the last segment — quick way back up a level.
  function stepBack() {
    onChange(chosen.slice(0, -1).join(", ") + (chosen.length > 1 ? ", " : ""));
    inputRef.current?.focus();
  }

  const levelLabel =
    LEVEL_LABELS[Math.min(chosen.length, LEVEL_LABELS.length - 1)];
  const showList = open && options.length > 0 && pos;

  return (
    <>
      <div className="relative">
        <MapPin
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation(); // не закрывать модалку — только список
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className={cx("input pl-8", value && "pr-8", className)}
        />
        {value && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            title="Очистить"
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {showList && (
        <div
          // preventDefault keeps the input focused so the click lands before blur
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-[80] overflow-hidden rounded-lg border border-line bg-white shadow-lg"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <div className="flex items-center justify-between border-b border-line bg-gray-50 px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              {levelLabel}
            </span>
            {chosen.length > 0 && (
              <button
                type="button"
                onClick={stepBack}
                className="flex items-center gap-1 text-[10px] font-semibold text-muted transition-colors hover:text-accent"
              >
                <CornerDownLeft size={11} /> назад
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {options.map((n) => (
              <button
                key={n.name}
                type="button"
                onClick={() => pick(n)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-ink transition-colors hover:bg-gray-50"
              >
                <span className="truncate">{n.name}</span>
                {n.children?.length ? (
                  <span className="shrink-0 text-[10px] text-muted">
                    {n.children.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
