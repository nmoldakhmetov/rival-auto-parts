import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildWaLink } from "@/lib/whatsapp";
import { formatTenge } from "@/lib/format";
import { getDiscountContext } from "@/lib/pricing";
import { sendOrderToOneC } from "@/lib/onec-orders";
import { getActiveGiftRules, earnedGiftIds } from "@/lib/gifts";

export const dynamic = "force-dynamic";

type IncomingItem = { productId: string; qty: number };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { items?: IncomingItem[]; comment?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const incoming = Array.isArray(body.items) ? body.items : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "Корзина пуста" }, { status: 400 });
  }

  // Re-price on the server — never trust prices coming from the client.
  const products = await prisma.product.findMany({
    where: { id: { in: incoming.map((i) => i.productId) } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const me = await prisma.user.findUnique({
    where: { id: session.sub },
    include: { manager: true },
  });

  // Apply the client's discount rules (per-product) to the order price.
  const disc = await getDiscountContext(session.sub, session.role);

  let total = 0;
  const orderItems: {
    productId: string;
    sku: string;
    name: string;
    price: number;
    qty: number;
    isGift: boolean;
  }[] = [];
  const onecProducts: {
    code: string | null;
    sku: string;
    qty: number;
    price: number;
  }[] = [];
  const qtyById = new Map<string, number>();
  for (const i of incoming) {
    const p = byId.get(i.productId);
    if (!p) continue;
    const qty = Math.max(1, Math.trunc(Number(i.qty) || 1));
    const price = Math.round(Number(p.price) * (1 - disc.pctFor(p) / 100));
    total += price * qty;
    qtyById.set(p.id, (qtyById.get(p.id) ?? 0) + qty);
    orderItems.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      price,
      qty,
      isGift: false,
    });
    onecProducts.push({ code: p.code, sku: p.sku, qty, price });
  }

  if (orderItems.length === 0) {
    return NextResponse.json(
      { error: "Товары не найдены в каталоге" },
      { status: 400 }
    );
  }

  // Gifts: any rule whose trigger product reached its threshold adds its gift
  // products to the order for free (price 0). Computed server-side — never
  // trust the client. A gift the buyer also paid for is still added (free copy).
  const giftRules = await getActiveGiftRules();
  const giftIds = earnedGiftIds(giftRules, qtyById);
  if (giftIds.length > 0) {
    const giftProducts = await prisma.product.findMany({
      where: { id: { in: giftIds } },
    });
    for (const gp of giftProducts) {
      orderItems.push({
        productId: gp.id,
        sku: gp.sku,
        name: gp.name,
        price: 0,
        qty: 1,
        isGift: true,
      });
      onecProducts.push({ code: gp.code, sku: gp.sku, qty: 1, price: 0 });
    }
  }

  const order = await prisma.order.create({
    data: {
      userId: session.sub,
      status: "NEW",
      comment: body.comment?.trim() || null,
      total,
      items: { create: orderItems },
    },
  });

  const manager = me?.manager ?? null;
  const orderNo = order.id.slice(-6).toUpperCase();

  // Push the order to 1С (best-effort: the order is already saved locally).
  const onec = await sendOrderToOneC({
    site_order_id: orderNo,
    client_name: me?.fullName ?? "",
    client_phone: me?.phone ?? "",
    comment: body.comment?.trim() || "",
    products: onecProducts,
  });
  if (onec.ok) {
    await prisma.order
      .update({
        where: { id: order.id },
        data: { onecSent: true, onecNumber: onec.orderNumber ?? null },
      })
      .catch(() => {});
  }

  const lines = orderItems.map(
    (i, idx) =>
      `${idx + 1}. ${i.sku} — ${i.name} × ${i.qty} шт.${
        i.isGift ? " (подарок)" : ""
      }`
  );
  const text =
    `Здравствуйте! Заказ №${orderNo}` +
    (me?.fullName ? ` от «${me.fullName}»` : "") +
    `:\n${lines.join("\n")}\n\nИтого: ${formatTenge(total)}` +
    (body.comment?.trim() ? `\nКомментарий: ${body.comment.trim()}` : "");

  const waLink = manager?.phone ? buildWaLink(manager.phone, text) : null;

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    orderNo,
    total,
    waLink,
    onecSent: onec.ok,
    manager: manager
      ? { fullName: manager.fullName, phone: manager.phone }
      : null,
  });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { userId: session.sub },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      total: Number(o.total),
      comment: o.comment,
      createdAt: o.createdAt,
      items: o.items.map((i) => ({
        sku: i.sku,
        name: i.name,
        price: Number(i.price),
        qty: i.qty,
      })),
    })),
  });
}
