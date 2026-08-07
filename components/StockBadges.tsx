"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { formatNum } from "@/lib/format";
import type { StockCell } from "@/lib/types";
import { colorByKey, defaultColorFor } from "@/lib/warehouse-colors";

// Per-warehouse stock pills with a hover tooltip (delivery terms, admin-editable
// via Setting `warehouse_tooltip`). The tooltip is rendered position:fixed so it
// never gets clipped by overflow-hidden table wrappers; it is display-only
// (pointer-events: none) and works in every view: list, grid, favorites, popups.
export default function StockBadges({
  stocks,
  tooltip,
}: {
  stocks: StockCell[];
  tooltip?: string;
}) {
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  function show(e: React.MouseEvent) {
    if (!tooltip) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 280;
    let left = rect.left;
    if (typeof window !== "undefined" && left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    setTip({ top: rect.bottom + 6, left });
  }

  if (stocks.length === 0) {
    return <span className="text-xs text-muted">нет на складах</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {stocks.map((s) => (
        <span
          key={s.warehouse}
          onMouseEnter={show}
          onMouseLeave={() => setTip(null)}
          className={
            // Цвет закреплён за складом и правится в админке: три одинаково
            // зелёные плашки в строке было не различить с одного взгляда.
            // Нулевой остаток всегда серый — это состояние, а не склад.
            (s.qty > 0
              ? colorByKey(s.color ?? defaultColorFor(s.warehouse)).badge
              : "border-line bg-gray-50 text-muted") +
            " badge border" +
            (tooltip ? " cursor-help" : "")
          }
        >
          {s.warehouse}:&nbsp;<b>{s.capped ? ">70" : formatNum(s.qty)}</b>
        </span>
      ))}
      {tip && tooltip && (
        <div
          className="pointer-events-none fixed z-[70] w-[280px] rounded-lg bg-ink/95 p-2.5 text-[11px] font-semibold leading-relaxed text-white shadow-xl ring-1 ring-white/10"
          style={{ top: tip.top, left: tip.left }}
        >
          <div className="flex items-start gap-1.5">
            <Truck size={14} className="mt-0.5 shrink-0 text-green-400" />
            <span>{tooltip}</span>
          </div>
        </div>
      )}
    </div>
  );
}
