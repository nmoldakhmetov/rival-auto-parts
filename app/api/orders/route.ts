import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildWaLink } from "@/lib/whatsapp";
import { formatTenge } from "@/lib/format";
import { getDiscountContext } from "@/lib/pricing";
import { buildOneCComment, sendOrderToOneC } from "@/lib/onec-orders";
import { getActiveGiftRules } from "@/lib/gifts";
import { earnedGiftQty } from "@/lib/gift-earn";
import { isPairOnly, snapPairQty } from "@/lib/pair-only";

export const dynamic = "force-dynamic";

type IncomingItem = { productId: string; qty: number };

// Hard cap on a single line's quantity: protects the Decimal(12,2) total and
// mirrors the UI cap in CartQtySelector / the cart store.
const MAX_QTY = 100_000;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Orders are a client-only action (staff sees base prices and has no cart).
  if (session.role !== "CLIENT") {
    return NextResponse.json(
      { error: "Заказы оформляют только клиенты" },
      { status: 403 }
    );
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
  // The BlockOverlay is UI-only — enforce the debtor auto-block here too.
  if (!me?.isActive) {
    return NextResponse.json(
      { error: "Аккаунт заблокирован — обратитесь к вашему менеджеру" },
      { status: 403 }
    );
  }

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
    let qty = Math.min(MAX_QTY, Math.max(1, Math.trunc(Number(i.qty) || 1)));
    // «Диски UIDNU» are sold strictly in pairs — snap to even (min 2).
    if (isPairOnly(p.category)) qty = snapPairQty(qty);
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

  // Gifts: every full `minQty` of a trigger product earns one more set of the
  // rule's gift products, free (price 0). Computed server-side — never trust
  // the client. A gift the buyer also paid for is still added (free copies).
  const giftRules = await getActiveGiftRules();
  const earned = earnedGiftQty(giftRules, qtyById);
  if (earned.size > 0) {
    const giftProducts = await prisma.product.findMany({
      where: { id: { in: [...earned.keys()] } },
    });
    for (const gp of giftProducts) {
      const giftQty = earned.get(gp.id) ?? 1;
      orderItems.push({
        productId: gp.id,
        sku: gp.sku,
        name: gp.name,
        price: 0,
        qty: giftQty,
        isGift: true,
      });
      onecProducts.push({ code: gp.code, sku: gp.sku, qty: giftQty, price: 0 });
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
    comment: buildOneCComment(me?.address, body.comment),
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

  // Big orders would blow past URL limits (~2K chars) and break the wa.me
  // link entirely — cap the message; the full order is always in the portal.
  const MAX_WA_LINES = 40;
  const lines = orderItems.slice(0, MAX_WA_LINES).map(
    (i, idx) =>
      `${idx + 1}. ${i.sku} — ${i.name} × ${i.qty} шт.${
        i.isGift ? " (подарок)" : ""
      }`
  );
  if (orderItems.length > MAX_WA_LINES) {
    lines.push(
      `…и ещё ${orderItems.length - MAX_WA_LINES} поз. — полный состав в портале`
    );
  }
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
