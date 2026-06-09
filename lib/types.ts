export type StockCell = { warehouse: string; qty: number };

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
};
