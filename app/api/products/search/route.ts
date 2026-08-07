import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { CatalogRow } from "@/lib/types";
import { findAnalogMatches, normalizeSmart } from "@/lib/analogs";
import { getDiscountContext, priceFor } from "@/lib/pricing";
import { NOT_HIDDEN_CATEGORY } from "@/lib/categories";
import { categoriesUnderPath } from "@/lib/category-tree";
import { cached } from "@/lib/cache";
import { getSetting } from "@/lib/settings";
import { capStockForClient } from "@/lib/stock";
import { getActiveGiftRules } from "@/lib/gifts";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const make = (sp.get("make") ?? "").trim();
  const model = (sp.get("model") ?? "").trim();
  const category = (sp.get("category") ?? "").trim();
  const categoryGroup = (sp.get("categoryGroup") ?? "").trim();
  const minPrice = parseFloat(sp.get("minPrice") ?? "");
  const maxPrice = parseFloat(sp.get("maxPrice") ?? "");
  const inStock = sp.get("inStock") === "1";
  const sort = sp.get("sort") ?? ""; // "" | price_asc | price_desc
  const broadcastId = (sp.get("broadcast") ?? "").trim(); // ограничить выдачу товарами рассылки
  const promo = sp.get("promo") === "1"; // раздел «Акции»: подарки + скидки
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const PAGE_SIZE = 50;

  // Broadcast scope: the full catalog experience limited to one broadcast's
  // products. CLIENTs may only open broadcasts addressed to them (or global).
  if (broadcastId) {
    const b = await prisma.broadcast.findUnique({
      where: { id: broadcastId },
      select: {
        isGlobal: true,
        recipients: {
          where: { userId: session.sub },
          select: { id: true },
        },
      },
    });
    const visible =
      !!b &&
      (session.role !== "CLIENT" || b.isGlobal || b.recipients.length > 0);
    if (!visible) {
      return NextResponse.json({
        rows: [],
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        totalPages: 1,
        shown: 0,
        discountDisplay: "percent",
      });
    }
  }

  // Stock visibility: CLIENT sees only granted warehouses; staff see all.
  // Both lookups are cached for 30 s — they rarely change but used to cost
  // 4-5 DB round-trips on every keystroke.
  let allowedWhIds: string[] | null = null;
  if (session.role === "CLIENT") {
    allowedWhIds = await cached(`wh:${session.sub}`, 30_000, async () => {
      const access = await prisma.clientWarehouseAccess.findMany({
        where: { userId: session.sub },
        select: { warehouseId: true },
      });
      return access.map((a) => a.warehouseId);
    });
  }

  // Effective client discount context (rules + personal + global). Staff get none.
  const disc = await cached(`disc:${session.sub}`, 30_000, () =>
    getDiscountContext(session.sub, session.role)
  );

  // Display knobs (admin-adjustable, cached; settings PUT invalidates cfg:).
  const [dropDaysStr, discountDisplay, warehouseTooltip] = await Promise.all([
    cached("cfg:price_drop_days", 60_000, () => getSetting("price_drop_days")),
    cached("cfg:discount_display", 60_000, () => getSetting("discount_display")),
    cached("cfg:warehouse_tooltip", 60_000, () =>
      getSetting("warehouse_tooltip")
    ),
  ]);
  const dropDays = parseInt(dropDaysStr, 10) || 0;
  const nowMs = Date.now();
  const dropCutoffMs = nowMs - dropDays * 86_400_000;

  // Analog cross-reference: a typed code may resolve to one or more catalog skus.
  const analogMatches = q ? await findAnalogMatches(q) : [];
  const analogSkus = [...new Set(analogMatches.map((a) => a.sku))];
  const analogBySku = new Map(
    analogMatches.map((a) => [a.sku.toUpperCase(), a])
  );

  // Free-text search OR — the SAME field set is used for the search box (q)
  // and the model facet, so selecting a model returns exactly what typing it
  // would. No `brand` clause on purpose: the make is derived from full_name, so
  // "genesis"/"sonata" match via applicability text (make is a separate facet).
  // Smart match ignores spaces/dashes/case (zeekr 9x = zeekr9x = zeekr-9x).
  const textSearchOr = (term: string): Prisma.ProductWhereInput[] => {
    const norm = normalizeSmart(term);
    const or: Prisma.ProductWhereInput[] = [
      { sku: { contains: term, mode: "insensitive" } },
      { fullName: { contains: term, mode: "insensitive" } },
      { name: { contains: term, mode: "insensitive" } },
    ];
    if (norm.length >= 2) {
      or.push({ skuNorm: { contains: norm } });
      or.push({ fullNameNorm: { contains: norm } });
    }
    return or;
  };

  const and: Prisma.ProductWhereInput[] = [];
  if (q) {
    const or = textSearchOr(q);
    // A typed code can also resolve to catalog skus via the analog table.
    if (analogSkus.length > 0) or.push({ sku: { in: analogSkus } });
    and.push({ OR: or });
  }
  // The make facet only narrows the result when NO model is chosen. Picking a
  // model behaves exactly like typing that word: a brand-agnostic text search
  // over the whole catalog — so make+model and a free-text search for the model
  // return the identical set.
  if (make && !model) and.push({ brand: make });
  if (model) and.push({ OR: textSearchOr(model) });
  if (category) and.push({ category });
  else if (categoryGroup) {
    // `categoryGroup` is a taxonomy node path («Тормозные колодки/Ruvill») —
    // it maps to an explicit set of 1С categories. Unknown paths fall back to
    // the old prefix behaviour so stray/legacy links keep working.
    const leaves = categoriesUnderPath(categoryGroup);
    if (leaves.length > 0) and.push({ category: { in: leaves } });
    else and.push({ category: { startsWith: categoryGroup } });
  }
  if (Number.isFinite(minPrice)) and.push({ price: { gte: minPrice } });
  if (Number.isFinite(maxPrice)) and.push({ price: { lte: maxPrice } });
  if (inStock) {
    and.push({
      stocks: {
        some: {
          qty: { gt: 0 },
          ...(allowedWhIds ? { warehouseId: { in: allowedWhIds } } : {}),
        },
      },
    });
  }
  if (broadcastId) {
    and.push({ broadcasts: { some: { broadcastId } } });
  }
  // Never show products from hidden technical 1С folders (Unused / Архив папки).
  and.push(NOT_HIDDEN_CATEGORY);
  // Explicit price sorting: zero-priced items ("цена по запросу") would all
  // pile up at the top of "по возрастанию" — hide them while sorting by price.
  if (sort === "price_asc" || sort === "price_desc") {
    and.push({ price: { gt: 0 } });
  }
  const where: Prisma.ProductWhereInput = { AND: and };

  const stocksInclude = {
    stocks: {
      where: allowedWhIds
        ? { warehouseId: { in: allowedWhIds } }
        : undefined,
      include: { warehouse: { select: { name: true, color: true } } },
      orderBy: { warehouse: { name: "asc" as const } },
    },
  };
  // An explicit price sort overrides the pinned-first ordering.
  const orderBy =
    sort === "price_asc"
      ? [{ price: "asc" as const }, { name: "asc" as const }]
      : sort === "price_desc"
        ? [{ price: "desc" as const }, { name: "asc" as const }]
        : [
            { pinned: "desc" as const },
            { pinnedAt: "desc" as const },
            { name: "asc" as const },
          ];

  type ProductWithStocks = Awaited<
    ReturnType<typeof prisma.product.findMany<{ include: typeof stocksInclude }>>
  >;
  let total: number;
  let products: ProductWithStocks;
  let exactSet = new Set<string>();

  if (promo) {
    // «Акции»: gift-trigger products first, then 1С-discounted ones. The two
    // segments are paginated as one continuous list (gifts always on top).
    const triggerIds = [
      ...new Set((await getActiveGiftRules()).flatMap((r) => r.triggerIds)),
    ];
    // Скидка засчитывается, только если цена РЕАЛЬНО ниже прежней:
    //  • в БД — oldPrice > price (страховка от устаревших строк, где цена
    //    успела вырасти: иначе товар с подорожанием висел в «Акциях»);
    //  • по клиенту — наценка может съесть акцию 1С и поднять итоговую цену
    //    выше старой, тогда это уже не акция (см. priceFor: бейдж гаснет).
    const dropWhere: Prisma.ProductWhereInput =
      dropDays > 0
        ? {
            oldPrice: { not: null, gt: prisma.product.fields.price },
            priceDropAt: { gt: new Date(dropCutoffMs) },
          }
        : { oldPrice: { not: null, gt: prisma.product.fields.price } };

    const giftWhere: Prisma.ProductWhereInput = {
      AND: [...and, { id: { in: triggerIds } }],
    };
    const discWhere: Prisma.ProductWhereInput = {
      AND: [
        ...and,
        dropWhere,
        ...(triggerIds.length > 0 ? [{ id: { notIn: triggerIds } }] : []),
      ],
    };

    // Наценки индивидуальны, в SQL их не выразить: берём кандидатов «в цене»
    // (набор небольшой — он ограничен сроком акции) и отсеиваем те, где для
    // ЭТОГО клиента скидки не осталось. Список ID уже отсортирован, так что
    // страницу режем по нему, а тяжёлые данные с остатками грузим только для
    // строк текущей страницы.
    const discCandidates = await prisma.product.findMany({
      where: discWhere,
      select: {
        id: true,
        price: true,
        oldPrice: true,
        category: true,
        brand: true,
        isFinalPrice: true,
      },
      orderBy,
    });
    const discIds = discCandidates
      .filter(
        (p) =>
          priceFor(
            Number(p.price),
            p.oldPrice != null ? Number(p.oldPrice) : null,
            disc.pctFor(p)
          ).discountPct > 0
      )
      .map((p) => p.id);

    const giftTotal =
      triggerIds.length > 0 ? await prisma.product.count({ where: giftWhere }) : 0;
    total = giftTotal + discIds.length;

    const offset = (page - 1) * PAGE_SIZE;
    const giftSkip = Math.min(offset, giftTotal);
    const giftTake = Math.max(0, Math.min(PAGE_SIZE, giftTotal - offset));
    const discSkip = Math.max(0, offset - giftTotal);
    const pageDiscIds = discIds.slice(discSkip, discSkip + PAGE_SIZE - giftTake);

    const [giftProducts, discProducts] = await Promise.all([
      giftTake > 0
        ? prisma.product.findMany({
            where: giftWhere,
            include: stocksInclude,
            orderBy,
            skip: giftSkip,
            take: giftTake,
          })
        : ([] as unknown as ProductWithStocks),
      pageDiscIds.length > 0
        ? prisma.product.findMany({
            where: { id: { in: pageDiscIds } },
            include: stocksInclude,
            orderBy,
          })
        : ([] as unknown as ProductWithStocks),
    ]);
    products = [...giftProducts, ...discProducts];
  } else {
    // Exact match: the query IS the article/code/applicability (100% equality,
    // case- and separator-insensitive). Such products are pulled out of the
    // normal ordering and forced to the very top of page 1.
    const normQ = q ? normalizeSmart(q) : "";
    let exactProducts: ProductWithStocks = [] as unknown as ProductWithStocks;
    if (q) {
      const exactOr: Prisma.ProductWhereInput[] = [
        { sku: { equals: q, mode: "insensitive" } },
        { code: q },
        { fullName: { equals: q, mode: "insensitive" } },
      ];
      if (normQ.length >= 2) exactOr.push({ skuNorm: normQ });
      exactProducts = await prisma.product.findMany({
        where: { AND: [...and, { OR: exactOr }] },
        include: stocksInclude,
        orderBy,
        take: 10,
      });
    }
    const exactIds = exactProducts.map((p) => p.id);
    exactSet = new Set(exactIds);

    // The rest of the results exclude the exact rows; pagination is laid out as
    // [exact… + rest] on page 1, then plain PAGE_SIZE windows of the rest.
    const restWhere: Prisma.ProductWhereInput =
      exactIds.length > 0
        ? { AND: [...and, { id: { notIn: exactIds } }] }
        : where;
    const skip =
      page === 1 ? 0 : Math.max(0, (page - 1) * PAGE_SIZE - exactIds.length);
    const take = page === 1 ? PAGE_SIZE - exactIds.length : PAGE_SIZE;

    const [cnt, restProducts] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where: restWhere,
        include: stocksInclude,
        orderBy,
        skip,
        take,
      }),
    ]);
    total = cnt;
    products = page === 1 ? [...exactProducts, ...restProducts] : restProducts;
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const isClient = session.role === "CLIENT";
  const rows: CatalogRow[] = products.map((p) => {
    const stocks = capStockForClient(
      p.stocks.map((s) => ({
        warehouse: s.warehouse.name,
        qty: s.qty,
        color: s.warehouse.color,
      })),
      isClient
    );
    const analog = analogBySku.get(p.sku.toUpperCase());
    // The 1С price-drop strike-through only lives `price_drop_days` days
    // (0 = no limit). The badge auto-falls-back to «новинка» while newUntil.
    const dropActive =
      p.oldPrice != null &&
      (dropDays <= 0 ||
        (p.priceDropAt != null && p.priceDropAt.getTime() > dropCutoffMs));
    const priced = priceFor(
      Number(p.price),
      dropActive && p.oldPrice != null ? Number(p.oldPrice) : null,
      disc.pctFor(p)
    );
    return {
      id: p.id,
      code: p.code,
      sku: p.sku,
      name: p.name,
      fullName: p.fullName,
      brand: p.brand,
      category: p.category,
      price: priced.price,
      oldPrice: priced.oldPrice,
      discountPct: priced.discountPct,
      imageUrl: p.imageUrl,
      stocks,
      totalQty: stocks.reduce((acc, s) => acc + s.qty, 0),
      viaAnalog: analog ? { code: analog.code, brand: analog.brand } : null,
      pinned: p.pinned,
      badge:
        p.badge ??
        (p.newUntil != null && p.newUntil.getTime() > nowMs ? "NEW" : null),
      exactMatch: exactSet.has(p.id),
    };
  });

  // Shadow-log meaningful searches once (on the first page only).
  if (q.length > 0 && page === 1) {
    prisma.searchLog
      .create({
        data: { query: q, resultsCount: total, userId: session.sub },
      })
      .catch(() => {});
  }

  return NextResponse.json({
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
    shown: rows.length,
    discountDisplay,
    warehouseTooltip,
  });
}
