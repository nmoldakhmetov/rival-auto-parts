import { NextRequest, NextResponse } from "next/server";
import { Prisma, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerUserFilter } from "@/lib/admin-scope";
import { DEBT_STATUSES, countsAsDebt } from "@/lib/balance";

export const dynamic = "force-dynamic";

const STATUSES = new Set<string>([
  "NEW",
  "SENT",
  "PROCESSING",
  "OUT_OF_STOCK",
  "ISSUED",
  "COMPLETED",
  "CANCELLED",
]);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const status = (sp.get("status") ?? "").trim();
  const q = (sp.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const PAGE_SIZE = 30;

  const and: Prisma.OrderWhereInput[] = [];
  if (STATUSES.has(status)) and.push({ status: status as OrderStatus });

  // Manager → only their clients' orders; merge with the text search.
  const mgr = managerUserFilter(session);
  const userFilter: Prisma.UserWhereInput = { ...(mgr ?? {}) };
  if (q) {
    userFilter.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { login: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (Object.keys(userFilter).length > 0) {
    and.push({ user: { is: userFilter } });
  }
  const where: Prisma.OrderWhereInput = and.length ? { AND: and } : {};

  const [total, orders, agg, debtAgg] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        user: { select: { fullName: true, email: true, login: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.order.aggregate({ where, _sum: { total: true, paid: true } }),
    // Долг суммируется только по долговым статусам — иначе итог внизу не
    // сходился бы со столбцом «Долг» и с балансами клиентов.
    prisma.order.aggregate({
      where: { AND: [where, { status: { in: DEBT_STATUSES } }] },
      _sum: { total: true, paid: true },
    }),
  ]);

  const rows = orders.map((o) => {
    const totalNum = Number(o.total);
    const paidNum = Number(o.paid);
    return {
      id: o.id,
      orderNo: o.id.slice(-6).toUpperCase(),
      createdAt: o.createdAt,
      status: o.status,
      total: totalNum,
      paid: paidNum,
      // «Отказ клиента» и заказы, ещё не взятые в работу, долгом не считаются
      // — раньше в колонке висела полная сумма отменённого заказа.
      debt: countsAsDebt(o.status) ? totalNum - paidNum : 0,
      itemsCount: o._count.items,
      client: o.user
        ? { fullName: o.user.fullName, email: o.user.email, login: o.user.login }
        : null,
    };
  });

  const sumTotal = Number(agg._sum.total ?? 0);
  const sumPaid = Number(agg._sum.paid ?? 0);
  const sumDebt =
    Number(debtAgg._sum.total ?? 0) - Number(debtAgg._sum.paid ?? 0);

  return NextResponse.json({
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    sums: { total: sumTotal, paid: sumPaid, debt: sumDebt },
  });
}
