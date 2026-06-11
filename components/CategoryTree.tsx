"use client";

import { useState } from "react";
import { ChevronRight, LayoutGrid } from "lucide-react";
import { formatNum } from "@/lib/format";

export type CatLeaf = { name: string; count: number };
export type CatNode = {
  group: string;
  count: number;
  leaf: boolean;
  children: CatLeaf[];
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
  onPickGroup: (group: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (g: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const anySelected = !!(category || categoryGroup);

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

      {tree.map((node) => {
        // ── Leaf at the top level: same 24px leading slot as groups, so
        //    every label sits on one vertical line.
        if (node.leaf) {
          const active = category === node.group;
          return (
            <button
              key={node.group}
              onClick={() => onPickExact(node.group)}
              title={node.group}
              className={cx(
                "relative flex h-8 w-full items-center gap-1.5 pl-2 pr-2 text-left text-xs transition-colors",
                active
                  ? "bg-accent/5 font-semibold text-accent-dark"
                  : "text-ink hover:bg-gray-50"
              )}
            >
              {active && <ActiveBar />}
              <span className="h-5 w-5 shrink-0" />
              <span className="truncate">{node.group}</span>
              <CountPill n={node.count} active={active} />
            </button>
          );
        }

        // ── Group row: the whole row selects the group; the chevron only
        //    expands/collapses the children.
        const isOpen = open.has(node.group);
        const groupActive = categoryGroup === node.group;
        return (
          <div key={node.group}>
            <div
              className={cx(
                "relative flex h-8 w-full items-center gap-1.5 pl-2 pr-2 transition-colors",
                groupActive
                  ? "bg-accent/5 font-semibold text-accent-dark"
                  : "text-ink hover:bg-gray-50"
              )}
            >
              {groupActive && <ActiveBar />}
              <button
                onClick={() => toggle(node.group)}
                aria-label={isOpen ? "Свернуть" : "Развернуть"}
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
                onClick={() => onPickGroup(node.group)}
                title={node.group}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs"
              >
                <span className="truncate">{node.group}</span>
                <CountPill n={node.count} active={groupActive} />
              </button>
            </div>

            {/* Children: indented under a guide line, light fade-in */}
            {isOpen && (
              <div className="animate-fade-in-up relative ml-[18px] border-l border-line pl-1.5">
                {node.children.map((leaf) => {
                  const active = category === leaf.name;
                  return (
                    <button
                      key={leaf.name}
                      onClick={() => onPickExact(leaf.name)}
                      title={leaf.name}
                      className={cx(
                        "relative flex h-7 w-full items-center gap-1.5 rounded-md pl-2 pr-1.5 text-left text-[11px] transition-colors",
                        active
                          ? "bg-accent/5 font-semibold text-accent-dark"
                          : "text-muted hover:bg-gray-50 hover:text-ink"
                      )}
                    >
                      <span className="truncate">{leaf.name}</span>
                      <CountPill n={leaf.count} active={active} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
