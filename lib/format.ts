export function formatTenge(value: number): string {
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNum(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

// Discount badge text: "−15%" or "−1 234 ₸" depending on the admin-chosen
// display mode (Setting `discount_display`: percent | amount). `pct` is the
// 1С promo drop only (see lib/pricing.ts) — the amount is derived from it so
// the badge never leaks the client's personal discount.
export function formatDiscount(
  mode: string | undefined,
  pct: number,
  oldPrice: number | null | undefined,
  _price: number
): string {
  if (mode === "amount" && oldPrice != null && pct > 0) {
    return `−${formatTenge(Math.round((oldPrice * pct) / 100))}`;
  }
  return `−${pct}%`;
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
