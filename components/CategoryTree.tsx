"use client";

import { useState } from "react";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { formatNum } from "@/lib/format";

// Node shape produced by /api/products/filters (curated 3-level taxonomy over
// the flat 1С categories — see lib/category-tree.ts).
export type CatNode = {
  path: string; // stable id, sent back as `categoryGroup`
  label: string;
  count: number;
  category?: string; // exact 1С value when the node is a real leaf
  children: CatNode[];
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

// Right-aligned count pill — identical on every row so the column reads
// as one tidy vertical line.
function CountPill({ n, active }: { n: number; active?: boolean }) {
  return (
    <span
      className={cx(
        "ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium tabular-nums",
        active ? "bg-accent/15 text-accent-dark" : "bg-gray-100 text-muted"
      )}
    >
      {formatNum(n)}
    </span>
  );
}

// Thin accent bar marking the selected row.
function ActiveBar() {
  return (
    <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent" />
  );
}

export default function CategoryTree({
  tree,
  category,
  categoryGroup,
  onPickExact,
  onPickGroup,
  onClear,
}: {
  tree: CatNode[];
  category: string;
  categoryGroup: string;
  onPickExact: (name: string) => void;
  onPickGroup: (path: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (path: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const anySelected = !!(category || categoryGroup);

  // One row, rendered for any depth. Depth 0 rows match the old sizing; nested
  // levels get slightly tighter type and sit under a guide line.
  function Row({ node, depth }: { node: CatNode; depth: number }) {
    const isLeaf = node.children.length === 0;
    const active = isLeaf
      ? category === node.category
      : categoryGroup === node.path;
    const isOpen = open.has(node.path);
    const size = depth === 0 ? "h-8 text-xs" : "h-7 text-[11px]";
    const tone = active
      ? "bg-accent/5 font-semibold text-accent-dark"
      : depth === 0
        ? "text-ink hover:bg-gray-50"
        : "text-muted hover:bg-gray-50 hover:text-ink";

    if (isLeaf) {
      return (
        <button
          onClick={() => node.category && onPickExact(node.category)}
          title={node.label}
          className={cx(
            "relative flex w-full items-center gap-1.5 rounded-md pl-2 pr-2 text-left transition-colors",
            size,
            tone
          )}
        >
          {active && <ActiveBar />}
          {/* Keeps labels on one vertical line with the group rows above. */}
          {depth === 0 && <span className="h-5 w-5 shrink-0" />}
          <span className="truncate">{node.label}</span>
          <CountPill n={node.count} active={active} />
        </button>
      );
    }

    return (
      <div>
        {/* Group row: the label selects the whole group, the chevron only
            expands/collapses its children. */}
        <div
          className={cx(
            "relative flex w-full items-center gap-1.5 pl-2 pr-2 transition-colors",
            size,
            tone
          )}
        >
          {active && <ActiveBar />}
          <button
            onClick={() => toggle(node.path)}
            aria-label={isOpen ? "Свернуть" : "Развернуть"}
            aria-expanded={isOpen}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-gray-200/70 hover:text-ink"
          >
            <ChevronRight
              size={13}
              className={cx(
                "transition-transform duration-200",
                isOpen && "rotate-90"
              )}
            />
          </button>
          <button
            onClick={() => onPickGroup(node.path)}
            title={node.label}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span className="truncate">{node.label}</span>
            <CountPill n={node.count} active={active} />
          </button>
        </div>

        {isOpen && (
          <div className="animate-fade-in-up relative ml-[18px] border-l border-line pl-1.5">
            {node.children.map((child) => (
              <Row key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto overscroll-contain rounded-lg border border-line bg-white py-1">
      {/* Все категории */}
      <button
        onClick={onClear}
        className={cx(
          "relative flex h-8 w-full items-center gap-1.5 pl-2 pr-2 text-left text-xs transition-colors",
          !anySelected
            ? "bg-accent/5 font-semibold text-accent-dark"
            : "text-ink hover:bg-gray-50"
        )}
      >
        {!anySelected && <ActiveBar />}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted">
          <LayoutGrid size={12} />
        </span>
        <span className="truncate">Все категории</span>
      </button>

      {tree.map((node) => (
        <Row key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
