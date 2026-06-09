"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatNum } from "@/lib/format";

export type CatLeaf = { name: string; count: number };
export type CatNode = {
  group: string;
  count: number;
  leaf: boolean;
  children: CatLeaf[];
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

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
    <div className="max-h-72 overflow-y-auto rounded border border-line">
      <button
        onClick={onClear}
        className={cx(
          "flex w-full items-center px-2.5 py-1.5 text-left text-xs",
          !anySelected
            ? "bg-accent/10 font-semibold text-accent-dark"
            : "text-ink hover:bg-gray-50"
        )}
      >
        Все категории
      </button>

      {tree.map((node) => {
        if (node.leaf) {
          const active = category === node.group;
          return (
            <button
              key={node.group}
              onClick={() => onPickExact(node.group)}
              title={node.group}
              className={cx(
                "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs",
                active
                  ? "bg-accent/10 font-semibold text-accent-dark"
                  : "text-ink hover:bg-gray-50"
              )}
            >
              <span className="truncate">{node.group}</span>
              <span className="shrink-0 text-[10px] text-muted">
                {formatNum(node.count)}
              </span>
            </button>
          );
        }

        const isOpen = open.has(node.group);
        const groupActive = categoryGroup === node.group;
        return (
          <div key={node.group}>
            <div className={cx("flex items-center", groupActive && "bg-accent/10")}>
              <button
                onClick={() => toggle(node.group)}
                aria-label="Развернуть"
                className="flex h-7 w-6 shrink-0 items-center justify-center text-muted hover:text-ink"
              >
                <ChevronRight
                  size={13}
                  className={cx("transition-transform", isOpen && "rotate-90")}
                />
              </button>
              <button
                onClick={() => onPickGroup(node.group)}
                title={node.group}
                className={cx(
                  "flex flex-1 items-center justify-between gap-2 py-1.5 pr-2.5 text-left text-xs",
                  groupActive
                    ? "font-semibold text-accent-dark"
                    : "text-ink hover:text-accent"
                )}
              >
                <span className="truncate">{node.group}</span>
                <span className="shrink-0 text-[10px] text-muted">
                  {formatNum(node.count)}
                </span>
              </button>
            </div>

            {isOpen && (
              <div className="bg-gray-50/70">
                {node.children.map((leaf) => {
                  const active = category === leaf.name;
                  return (
                    <button
                      key={leaf.name}
                      onClick={() => onPickExact(leaf.name)}
                      title={leaf.name}
                      className={cx(
                        "flex w-full items-center justify-between gap-2 py-1.5 pl-8 pr-2.5 text-left text-[11px]",
                        active
                          ? "bg-accent/10 font-semibold text-accent-dark"
                          : "text-muted hover:bg-gray-100 hover:text-ink"
                      )}
                    >
                      <span className="truncate">{leaf.name}</span>
                      <span className="shrink-0 text-[10px]">
                        {formatNum(leaf.count)}
                      </span>
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
