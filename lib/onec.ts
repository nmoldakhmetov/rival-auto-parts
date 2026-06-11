import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

// ─────────────────────────────────────────────────────────────────────────
//  1С integration: fetch the product feed and upsert Product / Warehouse /
//  Stock. 1С HTTP-services expose fields with inconsistent casing/locale,
//  so every field is resolved against a list of likely key names.
//
//  Confirmed real feed shape (109.233.111.250:8888/hs/v1/products):
//    { code, sku, name, full_name, category, price,
//      stocks:[{warehouse, qty}], image_url }
//  The feed has no "brand" field, so the car make is derived from full_name.
//  image_url points at http://localhost:8888/... → host is rewritten.
// ─────────────────────────────────────────────────────────────────────────

export type SyncResult = {
  ok: boolean;
  fetched: number;
  productsUpserted: number;
  warehousesUpserted: number;
  stocksUpserted: number;
  durationMs: number;
  error?: string;
};

type Raw = Record<string, unknown>;

function pick(obj: Raw | undefined | null, keys: string[]): unknown {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function asString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// Normalized search key (separators stripped, lowercased) for skuNorm/fullNameNorm.
const SEARCH_SEP = /[\s\-_./()[\]]+/g;
function normSearch(s: string | null): string | null {
  if (!s) return null;
  const n = s.toLowerCase().replace(SEARCH_SEP, "");
  return n.length ? n : null;
}

const CODE_KEYS = ["code", "Code", "Код", "id", "ID", "Ссылка", "guid", "GUID"];
const SKU_KEYS = ["sku", "SKU", "Артикул", "article", "vendor_code", "vendorCode", "Code", "code"];
const NAME_KEYS = ["name", "Name", "Наименование", "title", "Название"];
const FULLNAME_KEYS = [
  "full_name", "fullName", "fullname", "Применяемость", "applicability",
  "description", "Описание", "НаименованиеПолное", "ПолноеНаименование",
];
const BRAND_KEYS = ["brand", "Brand", "Бренд", "manufacturer", "Производитель", "vendor", "Марка"];
const CATEGORY_KEYS = ["category", "Category", "Категория", "group", "Группа", "ГруппаТоваров"];
const PRICE_KEYS = ["price", "Price", "Цена", "cost", "ЦенаПродажи", "РозничнаяЦена", "ОптоваяЦена"];
const IMAGE_KEYS = ["image_url", "imageUrl", "image", "Картинка", "picture", "img", "Изображение", "photo", "Фото", "url"];
const STOCKS_KEYS = ["stocks", "Stocks", "Остатки", "остатки", "rests", "warehouses", "Склады", "ОстаткиПоСкладам"];
const WH_NAME_KEYS = ["warehouse", "Warehouse", "Склад", "warehouse_name", "warehouseName", "name", "Name", "НаименованиеСклада", "Хранилище"];
const QTY_KEYS = ["qty", "Qty", "Количество", "quantity", "count", "amount", "остаток", "rest", "Остаток", "Кол", "В наличии"];

// ─── Image host rewriting ────────────────────────────────────────────────
// The feed returns images as http://localhost:8888/... (the 1С box referring
// to itself). Rewrite that host to the public 1С origin so browsers/proxy
// can reach it.

export function onecOrigin(): string | null {
  const url = process.env.ONEC_API_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function rewriteImageHost(raw: string): string {
  const origin = onecOrigin();
  if (!origin) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      const o = new URL(origin);
      u.protocol = o.protocol;
      u.hostname = o.hostname;
      u.port = o.port;
      return u.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}

// ─── Car make detection (no brand field in the feed) ─────────────────────
// Make is parsed from full_name (e.g. "Toyota Land Cruiser Prado ..." → Toyota).

const CAR_MAKES: [string, string[]][] = [
  ["Toyota", ["Toyota", "Тойота"]],
  ["Lexus", ["Lexus", "Лексус"]],
  ["Nissan", ["Nissan", "Ниссан"]],
  ["Infiniti", ["Infiniti", "Инфинити"]],
  ["Honda", ["Honda", "Хонда"]],
  ["Mazda", ["Mazda", "Мазда"]],
  ["Mitsubishi", ["Mitsubishi", "Митсубиси", "Мицубиси"]],
  ["Subaru", ["Subaru", "Субару"]],
  ["Suzuki", ["Suzuki", "Сузуки"]],
  ["Isuzu", ["Isuzu", "Исузу"]],
  ["Hyundai", ["Hyundai", "Хендай", "Хундай", "Хёндэ"]],
  ["Kia", ["Kia", "Киа", "КИА"]],
  ["Genesis", ["Genesis", "Дженезис"]],
  ["SsangYong", ["SsangYong", "Санг Йонг", "Сан Йонг"]],
  ["Daewoo", ["Daewoo", "Дэу", "Дэо"]],
  ["Chevrolet", ["Chevrolet", "Шевроле"]],
  ["Cadillac", ["Cadillac", "Кадиллак"]],
  ["GMC", ["GMC"]],
  ["Ford", ["Ford", "Форд"]],
  ["Dodge", ["Dodge", "Додж"]],
  ["Jeep", ["Jeep", "Джип"]],
  ["Chrysler", ["Chrysler", "Крайслер"]],
  ["BMW", ["BMW", "БМВ"]],
  ["Mercedes-Benz", ["Mercedes-Benz", "Mercedes", "Мерседес", "Бенц"]],
  ["Audi", ["Audi", "Ауди"]],
  ["Volkswagen", ["Volkswagen", "VW", "Фольксваген"]],
  ["Porsche", ["Porsche", "Порше"]],
  ["Opel", ["Opel", "Опель"]],
  ["Skoda", ["Skoda", "Škoda", "Шкода"]],
  ["Seat", ["Seat", "Сеат"]],
  ["Renault", ["Renault", "Рено"]],
  ["Peugeot", ["Peugeot", "Пежо"]],
  ["Citroen", ["Citroen", "Citroën", "Ситроен"]],
  ["Fiat", ["Fiat", "Фиат"]],
  ["Volvo", ["Volvo", "Вольво"]],
  ["Land Rover", ["Land Rover", "Range Rover", "Ленд Ровер"]],
  ["Jaguar", ["Jaguar", "Ягуар"]],
  ["Mini", ["Mini Cooper", "MINI"]],
  ["BYD", ["BYD"]],
  ["Chery", ["Chery", "Чери"]],
  ["Geely", ["Geely", "Джили"]],
  ["Haval", ["Haval", "Хавал"]],
  ["Great Wall", ["Great Wall", "Грейт Вол"]],
  ["Changan", ["Changan", "Чанган"]],
  ["JAC", ["JAC"]],
  ["Exeed", ["Exeed", "Эксид"]],
  ["Tank", ["Tank"]],
  ["Lada", ["Lada", "ВАЗ", "Лада", "VAZ"]],
  ["GAZ", ["ГАЗ", "GAZ"]],
  ["UAZ", ["УАЗ", "UAZ"]],
  ["Datsun", ["Datsun", "Датсун"]],
  ["MG", ["MG"]],
  ["Foton", ["Foton", "Фотон"]],
  ["Hino", ["Hino", "Хино"]],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MAKE_MATCHERS: { make: string; re: RegExp }[] = CAR_MAKES.flatMap(
  ([canonical, aliases]) =>
    aliases.map((a) => ({
      make: canonical,
      re: new RegExp(
        `(?<![\\p{L}\\p{N}])${escapeRegex(a)}(?![\\p{L}\\p{N}])`,
        "iu"
      ),
    }))
);

export function detectMake(fullName: string | null): string | null {
  if (!fullName) return null;
  let best: { make: string; idx: number } | null = null;
  for (const m of MAKE_MATCHERS) {
    const match = m.re.exec(fullName);
    if (match && (best === null || match.index < best.idx)) {
      best = { make: m.make, idx: match.index };
    }
  }
  return best?.make ?? null;
}

// ─── Car model detection ─────────────────────────────────────────────────
// The feed has no model field either, so we take the 1–3 tokens that follow
// the make alias inside the applicability string. Best-effort, but groups
// catalogue items well enough for a "make → models" filter.

// Stop the model at the first boundary: punctuation, a 4-digit year, or a
// Russian preposition that typically introduces the rest of the description.
const MODEL_STOP = /[,;:.()[\]/«»"]|\s\d{4}|\s(?:для|на|с|по|от|до|год|г\.)\b/iu;

export function detectModel(
  fullName: string | null,
  make: string | null
): string | null {
  if (!fullName || !make) return null;
  // Find the earliest alias match for this specific make.
  let end = -1;
  let pos = Infinity;
  for (const m of MAKE_MATCHERS) {
    if (m.make !== make) continue;
    const mm = m.re.exec(fullName);
    if (mm && mm.index < pos) {
      pos = mm.index;
      end = mm.index + mm[0].length;
    }
  }
  if (end < 0) return null;

  let rest = fullName.slice(end);
  const stop = rest.search(MODEL_STOP);
  if (stop > 0) rest = rest.slice(0, stop);

  const tokens = rest
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    // keep letters/digits/dash inside a token
    .map((t) => t.replace(/[^\p{L}\p{N}-]+/gu, ""))
    .filter((t) => t.length > 0);

  const model = tokens.join(" ").trim().slice(0, 40);
  return model.length >= 2 ? model : null;
}

// ─── Fetch ───────────────────────────────────────────────────────────────

export async function fetchOneCProducts(): Promise<Raw[]> {
  const url = process.env.ONEC_API_URL;
  if (!url) throw new Error("ONEC_API_URL не настроен в .env");

  const headers: Record<string, string> = { Accept: "application/json" };
  const user = process.env.ONEC_API_USER;
  if (user) {
    const pass = process.env.ONEC_API_PASSWORD ?? "";
    headers.Authorization =
      "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`1С ответил ${res.status} ${res.statusText}`);
    }
    const data: unknown = await res.json();
    const arr = Array.isArray(data)
      ? data
      : (pick(data as Raw, ["products", "Товары", "items", "data", "nomenclature", "Номенклатура", "result"]) as unknown);
    if (!Array.isArray(arr)) {
      throw new Error("В ответе 1С не найден массив товаров");
    }
    return arr as Raw[];
  } finally {
    clearTimeout(timer);
  }
}

// ─── Sync ────────────────────────────────────────────────────────────────

export async function syncFromOneC(): Promise<SyncResult> {
  const started = Date.now();
  const result: SyncResult = {
    ok: false,
    fetched: 0,
    productsUpserted: 0,
    warehousesUpserted: 0,
    stocksUpserted: 0,
    durationMs: 0,
  };

  try {
    const items = await fetchOneCProducts();
    result.fetched = items.length;

    // Deduplicate by 1С code so concurrent upserts never race on the same key.
    const byCode = new Map<string, Raw>();
    for (const it of items) {
      const code = asString(pick(it, CODE_KEYS));
      if (code) byCode.set(code, it);
    }
    const products = Array.from(byCode.entries());

    // 1) Upsert every unique warehouse once → name→id map.
    const whNames = new Set<string>();
    for (const [, it] of products) {
      const stocks = pick(it, STOCKS_KEYS);
      if (Array.isArray(stocks)) {
        for (const s of stocks) {
          const wn = asString(pick(s as Raw, WH_NAME_KEYS));
          if (wn) whNames.add(wn);
        }
      }
    }
    const whMap = new Map<string, string>();
    for (const name of Array.from(whNames)) {
      const wh = await prisma.warehouse.upsert({
        where: { name },
        create: { name },
        update: {},
      });
      whMap.set(name, wh.id);
      result.warehousesUpserted++;
    }

    // Existing price state → keep / start / clear the price-drop discount.
    // The sync may run every minute, so an unchanged price must PRESERVE the
    // current discount (oldPrice/priceDropAt), not reset it.
    const existing = await prisma.product.findMany({
      where: { code: { in: products.map(([c]) => c) } },
      select: { code: true, price: true, oldPrice: true, priceDropAt: true },
    });
    const prevMap = new Map(
      existing.map((p) => [
        p.code,
        {
          price: Number(p.price),
          oldPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
          priceDropAt: p.priceDropAt,
        },
      ])
    );

    // Auto-"новинка": products first seen in 1С wear the NEW badge for N days.
    const now = new Date();
    const newDays = parseInt(await getSetting("new_badge_days"), 10) || 0;
    const newUntil =
      newDays > 0 ? new Date(now.getTime() + newDays * 86_400_000) : null;

    // 2) Upsert products (+ stocks) in bounded-concurrency chunks.
    const CHUNK = 25;
    for (let i = 0; i < products.length; i += CHUNK) {
      const chunk = products.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async ([code, it]) => {
          const fullName = asString(pick(it, FULLNAME_KEYS));
          const rawImg = asString(pick(it, IMAGE_KEYS));
          const skuVal = asString(pick(it, SKU_KEYS)) ?? code;
          const priceVal = toNumber(pick(it, PRICE_KEYS));
          const brandVal = asString(pick(it, BRAND_KEYS)) ?? detectMake(fullName);
          const modelVal = detectModel(fullName, brandVal);
          const fields = {
            sku: skuVal,
            name: asString(pick(it, NAME_KEYS)) ?? "Без названия",
            fullName,
            brand: brandVal,
            model: modelVal,
            modelNorm: normSearch(modelVal),
            category: asString(pick(it, CATEGORY_KEYS)),
            price: priceVal,
            imageUrl: rawImg ? rewriteImageHost(rawImg) : null,
            skuNorm: normSearch(skuVal),
            fullNameNorm: normSearch(fullName),
          };
          // Price-drop discount lifecycle:
          //  • price went DOWN  → strike the highest known price, stamp now;
          //  • price unchanged  → keep the existing discount untouched;
          //  • price went UP    → discount is gone.
          const prev = prevMap.get(code);
          let oldPrice: number | null = null;
          let priceDropAt: Date | null = null;
          if (prev) {
            if (priceVal < prev.price) {
              oldPrice = Math.max(prev.price, prev.oldPrice ?? 0);
              priceDropAt = now;
            } else if (
              priceVal === prev.price &&
              prev.oldPrice != null &&
              priceVal < prev.oldPrice
            ) {
              oldPrice = prev.oldPrice;
              priceDropAt = prev.priceDropAt;
            }
          }

          const product = await prisma.product.upsert({
            where: { code },
            create: { code, ...fields, newUntil },
            update: { ...fields, oldPrice, priceDropAt },
          });
          result.productsUpserted++;

          const stocks = pick(it, STOCKS_KEYS);
          if (Array.isArray(stocks)) {
            for (const s of stocks) {
              const wn = asString(pick(s as Raw, WH_NAME_KEYS));
              if (!wn) continue;
              const whId = whMap.get(wn);
              if (!whId) continue;
              const qty = Math.trunc(toNumber(pick(s as Raw, QTY_KEYS)));
              await prisma.stock.upsert({
                where: {
                  productId_warehouseId: {
                    productId: product.id,
                    warehouseId: whId,
                  },
                },
                create: { productId: product.id, warehouseId: whId, qty },
                update: { qty },
              });
              result.stocksUpserted++;
            }
          }
        })
      );
    }

    result.ok = true;
    result.durationMs = Date.now() - started;
    return result;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    result.durationMs = Date.now() - started;
    return result;
  }
}
