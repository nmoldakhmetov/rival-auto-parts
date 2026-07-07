// `capped` is set when the real quantity is hidden from a CLIENT (qty above
// CLIENT_STOCK_CAP shows as ">70" instead of the exact number — see lib/stock).
export type StockCell = { warehouse: string; qty: number; capped?: boolean };

export type CatalogRow = {
  id: string;
  code: string;
  sku: string;
  name: string;
  fullName: string | null;
  brand: string | null;
  category: string | null;
  price: number; // цена для клиента (с учётом его скидки)
  oldPrice: number | null; // зачёркнутая цена (если есть скидка)
  discountPct: number; // суммарная скидка, %
  imageUrl: string | null;
  stocks: StockCell[];
  totalQty: number;
  viaAnalog: { code: string; brand: string | null } | null;
  pinned: boolean;
  badge: "NEW" | "HIT" | null;
  // The search query equals this product's sku/code/fullName (search route
  // pins such rows to the top of page 1; the UI highlights them).
  exactMatch?: boolean;
};
