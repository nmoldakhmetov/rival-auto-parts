import "server-only";
import { prisma } from "@/lib/prisma";

// Склады в заказе.
//
// Заказ с сайта уходит в 1С РАЗБИТЫМ ПО СКЛАДАМ: один документ на склад.
// Заказчик работает так же вживую — товар с «БК склад» и «БК склад 2»
// собирают разные люди, и одна общая заявка на два склада им не годится.
//
// Склад строки определяется так:
//   1. явный выбор клиента в корзине (если у товара несколько складов);
//   2. иначе — единственный склад с остатком;
//   3. если складов с остатком несколько, а выбора нет — берётся склад с
//      наибольшим остатком (страховка: корзина могла прийти из старой
//      версии клиента, ронять заказ из-за этого нельзя);
//   4. остатка нигде нет — строка идёт в документ «без склада» (под заказ).

export type WarehouseOption = { name: string; qty: number };

// Склады, к которым у клиента есть доступ И на которых есть остаток,
// по каждому запрошенному товару. Порядок — по убыванию остатка, чтобы
// «основной» склад товара был первым и в корзине, и при авто-выборе.
export async function warehouseOptionsFor(
  userId: string,
  productIds: string[]
): Promise<Map<string, WarehouseOption[]>> {
  const out = new Map<string, WarehouseOption[]>();
  if (productIds.length === 0) return out;

  const access = await prisma.clientWarehouseAccess.findMany({
    where: { userId },
    select: { warehouseId: true },
  });
  const allowed = access.map((a) => a.warehouseId);
  if (allowed.length === 0) return out;

  const rows = await prisma.stock.findMany({
    where: {
      productId: { in: productIds },
      warehouseId: { in: allowed },
      qty: { gt: 0 },
    },
    select: { productId: true, qty: true, warehouse: { select: { name: true } } },
  });

  for (const r of rows) {
    const list = out.get(r.productId) ?? [];
    list.push({ name: r.warehouse.name, qty: r.qty });
    out.set(r.productId, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, "ru"));
  }
  return out;
}

// Склад для одной строки заказа. `wanted` — выбор клиента из корзины.
export function pickWarehouse(
  options: WarehouseOption[] | undefined,
  wanted?: string | null
): string | null {
  if (!options || options.length === 0) return null;
  const want = (wanted ?? "").trim();
  if (want) {
    const hit = options.find((o) => o.name === want);
    if (hit) return hit.name;
    // Выбор устарел (склад кончился или доступ сняли) — молча падаем на
    // авто-выбор ниже, заказ важнее буквального следования просроченному
    // выбору.
  }
  return options[0].name; // список уже отсортирован по убыванию остатка
}

// Группировка строк заказа в документы 1С: по одному на склад, порядок
// строк внутри документа сохраняется. Ключ null — «без склада».
export function groupByWarehouse<T>(
  lines: T[],
  warehouseOf: (line: T) => string | null
): { warehouse: string | null; lines: T[] }[] {
  const groups = new Map<string, { warehouse: string | null; lines: T[] }>();
  for (const line of lines) {
    const wh = warehouseOf(line);
    const key = wh ?? "";
    const g = groups.get(key) ?? { warehouse: wh, lines: [] };
    g.lines.push(line);
    groups.set(key, g);
  }
  // Документ «без склада» — последним: сначала то, что реально отгружается.
  return [...groups.values()].sort((a, b) => {
    if (a.warehouse === b.warehouse) return 0;
    if (a.warehouse === null) return 1;
    if (b.warehouse === null) return -1;
    return 0;
  });
}
