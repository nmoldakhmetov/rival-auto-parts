import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getDiscountContext, priceFor } from "@/lib/pricing";

export const dynamic = "force-dynamic";

// GET — broadcasts visible to the current client (global or addressed to them),
// newest first, with read flag and discounted product cards.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "CLIENT") {
    return NextResponse.json({ broadcasts: [], unread: 0 });
  }

  const broadcasts = await prisma.broadcast.findMany({
    where: {
      OR: [{ isGlobal: true }, { recipients: { some: { userId: session.sub } } }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      products: {
        include: {
          product: {
            select: {
              id: true,
              code: true,
              sku: true,
              name: true,
              fullName: true,
              brand: true,
              category: true,
              price: true,
              oldPrice: true,
              imageUrl: true,
              badge: true,
            },
          },
        },
      },
      recipients: {
        where: { userId: session.sub },
        select: { readAt: true },
      },
    },
  });

  const disc = await getDiscountContext(session.sub, session.role);

  let unread = 0;
  const rows = broadcasts.map((b) => {
    const read = b.recipients[0]?.readAt != null;
    if (!read) unread += 1;
    return {
      id: b.id,
      title: b.title,
      text: b.text,
      createdAt: b.createdAt,
      read,
      products: b.products
        .filter((bp) => bp.product)
        .map((bp) => {
          const p = bp.product;
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
            badge: p.badge,
          };
        }),
    };
  });

  return NextResponse.json({ broadcasts: rows, unread });
}

// POST — mark broadcast(s) as read for the current client.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "CLIENT") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string; ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const ids = [
    ...new Set([...(body.ids ?? []), ...(body.id ? [body.id] : [])].filter(Boolean)),
  ];
  if (ids.length === 0) return NextResponse.json({ ok: true });

  // Only mark broadcasts the client may actually see.
  const visible = await prisma.broadcast.findMany({
    where: {
      id: { in: ids },
      OR: [{ isGlobal: true }, { recipients: { some: { userId: session.sub } } }],
    },
    select: { id: true },
  });

  const now = new Date();
  await Promise.all(
    visible.map((b) =>
      prisma.broadcastRecipient.upsert({
        where: {
          broadcastId_userId: { broadcastId: b.id, userId: session.sub },
        },
        update: { readAt: now },
        create: { broadcastId: b.id, userId: session.sub, readAt: now },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
