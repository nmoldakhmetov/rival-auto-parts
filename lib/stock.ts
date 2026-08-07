import type { StockCell } from "@/lib/types";

// Clients must not see exact stock above this threshold — anything higher is
// shown as ">70" so precise inventory levels stay hidden from buyers. Staff
// always see the real number.
export const CLIENT_STOCK_CAP = 70;

// Caps per-warehouse quantities for a CLIENT: any cell above the threshold is
// clamped to the cap and flagged so the UI can render ">70". The real number
// never leaves the server. Staff (isClient=false) get the cells unchanged.
export function capStockForClient(
  stocks: StockCell[],
  isClient: boolean
): StockCell[] {
  if (!isClient) return stocks;
  return stocks.map((s) =>
    s.qty > CLIENT_STOCK_CAP
      ? { ...s, qty: CLIENT_STOCK_CAP, capped: true }
      : { ...s }
  );
}
