import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import type { CatalogRow } from "@/lib/types";
import { findAnalogMatches, normalizeSmart } from "@/lib/analogs";
import { getDiscountContext, priceFor } from "@/lib/pricing";
import { NOT_HIDDEN_CATEGORY } from "@/lib/categories";

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
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const PAGE_SIZE = 50;

  // Stock visibility: CLIENT sees only granted warehouses; staff see all.
  let allowedWhIds: string[] | null = null;
  if (session.role === "CLIENT") {
    const access = await prisma.clientWarehouseAccess.findMany({
      where: { userId: session.sub },
      select: { warehouseId: true },
    });
    allowedWhIds = access.map((a) => a.warehouseId);
  }

  // Effective client discount context (rules + personal + global). Staff get none.
  const disc = await getDiscountContext(session.sub, session.role);

  // Analog cross-reference: a typed code may resolve to one or more catalog skus.
  const analogMatches = q ? await findAnalogMatches(q) : [];
  const analogSkus = [...new Set(analogMatches.map((a) => a.sku))];
  const analogBySku = new Map(
    analogMatches.map((a) => [a.sku.toUpperCase(), a])
  );

  const normQ = q ? normalizeSmart(q) : "";

  const and: Prisma.ProductWhereInput[] = [];
  if (q) {
    const or: Prisma.ProductWhereInput[] = [
      { sku: { contains: q, mode: "insensitive" } },
      { fullName: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
    ];
    // Smart match: ignore spaces/dashes/case (zeekr 9x = zeekr9x = zeekr-9x).
    if (normQ.length >= 2) {
      or.push({ skuNorm: { contains: normQ } });
      or.push({ fullNameNorm: { contains: normQ } });
    }
    if (analogSkus.length > 0) {
      or.push({ sku: { in: analogSkus } });
    }
    and.push({ OR: or });
  }
  if (make) and.push({ brand: make });
  if (model) and.push({ model });
  if (category) and.push({ category });
  else if (categoryGroup) and.push({ category: { startsWith: categoryGroup } });
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
  // Never show products from hidden technical 1С folders (Unused / Архив папки).
  and.push(NOT_HIDDEN_CATEGORY);
  const where: Prisma.ProductWhereInput = { AND: and };

  const skip = (page - 1) * PAGE_SIZE;
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: {
        stocks: {
          where: allowedWhIds ? { warehouseId: { in: allowedWhIds } } : undefined,
          include: { warehouse: { select: { name: true } } },
          orderBy: { warehouse: { name: "asc" } },
        },
      },
      orderBy: [{ pinned: "desc" }, { pinnedAt: "desc" }, { name: "asc" }],
      skip,
      take: PAGE_SIZE,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: CatalogRow[] = products.map((p) => {
    const stocks = p.stocks.map((s) => ({
      warehouse: s.warehouse.name,
      qty: s.qty,
    }));
    const analog = analogBySku.get(p.sku.toUpperCase());
    const priced = priceFor(
      Number(p.price),
      p.oldPrice != null ? Number(p.oldPrice) : null,
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
      badge: p.badge,
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
  });
}
