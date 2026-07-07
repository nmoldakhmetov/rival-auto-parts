"use client";

import { List, LayoutGrid } from "lucide-react";

export type ViewMode = "list" | "grid";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Segmented list/grid switcher shared by the catalog and the favorites page.
export default function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const btn = (v: ViewMode, label: string, Icon: typeof List) => (
    <button
      onClick={() => onChange(v)}
      title={label}
      className={cx(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
        view === v ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
      )}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
  return (
    <div className="inline-flex rounded-lg border border-line bg-gray-50 p-0.5">
      {btn("list", "Список", List)}
      {btn("grid", "Сетка", LayoutGrid)}
    </div>
  );
}
