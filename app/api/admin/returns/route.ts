import { NextRequest, NextResponse } from "next/server";
import { Prisma, ReturnStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { managerUserFilter } from "@/lib/admin-scope";

export const dynamic = "force-dynamic";

const STATUSES = new Set<string>(["NEW", "PROCESSING", "ACCEPTED", "REJECTED"]);

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

  const and: Prisma.ReturnWhereInput[] = [];
  if (STATUSES.has(status)) and.push({ status: status as ReturnStatus });
  // Manager → only returns from their own clients.
  const mgr = managerUserFilter(session);
  if (mgr) and.push({ user: { is: mgr } });
  if (q) {
    and.push({
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { user: { is: { fullName: { contains: q, mode: "insensitive" } } } },
        { user: { is: { login: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  const where: Prisma.ReturnWhereInput = and.length ? { AND: and } : {};

  const [total, returns] = await Promise.all([
    prisma.return.count({ where }),
    prisma.return.findMany({
      where,
      include: { user: { select: { fullName: true, login: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return NextResponse.json({
    rows: returns.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      code: r.code,
      sku: r.sku,
      name: r.name,
      qty: r.qty,
      price: Number(r.price),
      sum: Number(r.price) * r.qty,
      warehouseName: r.warehouseName,
      reason: r.reason,
      comment: r.comment,
      status: r.status,
      client: r.user
        ? { fullName: r.user.fullName, login: r.user.login }
        : null,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}
