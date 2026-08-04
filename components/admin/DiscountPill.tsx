"use client";

import { BadgePercent } from "lucide-react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export type DiscountSummaryLite = {
  discount: number;
  markup: number;
  net: number;
  targeted: number;
};

// Плашка «сколько у клиента скидка/наценка» для списков клиентов и заказов.
// Зелёная «−10%» — скидка, красная «+5%» — наценка, «—» — ничего.
// Адресные правила (категория/марка/товар) одним процентом не выражаются,
// поэтому идут отдельным счётчиком.
export default function DiscountPill({
  summary,
  className,
}: {
  summary?: DiscountSummaryLite | null;
  className?: string;
}) {
  const s = summary;
  if (!s) return <span className="text-muted">—</span>;
  const { net, discount, markup, targeted } = s;

  const title =
    [
      discount > 0 ? `скидка ${discount}%` : null,
      markup > 0 ? `наценка ${markup}%` : null,
      targeted > 0
        ? `адресных правил: ${targeted} (на категорию/марку/товар)`
        : null,
    ]
      .filter(Boolean)
      .join(", ") || "скидок и наценок нет";

  return (
    <span className={cx("inline-flex items-center gap-1", className)} title={title}>
      {net === 0 ? (
        <span className="text-muted">—</span>
      ) : (
        <span
          className={cx(
            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
            net > 0 ? "bg-green-600 text-white" : "bg-accent text-white"
          )}
        >
          {net > 0 ? `−${net}%` : `+${Math.abs(net)}%`}
        </span>
      )}
      {targeted > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted"
          title={`Ещё ${targeted} правил(а) на конкретные категории, марки или товары`}
        >
          <BadgePercent size={9} />
          {targeted}
        </span>
      )}
    </span>
  );
}
