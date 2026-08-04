import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildWaLink } from "@/lib/whatsapp";
import { formatTenge } from "@/lib/format";
import { getDiscountContext } from "@/lib/pricing";
import { recalcUserBalance } from "@/lib/balance";
import {
  warehouseOptionsFor,
  pickWarehouse,
  groupByWarehouse,
} from "@/lib/order-warehouses";
import { buildOneCComment, sendOrderToOneC } from "@/lib/onec-orders";
import { getActiveGiftRules } from "@/lib/gifts";
import { earnedGiftQty } from "@/lib/gift-earn";
import { isPairOnly, snapPairQty } from "@/lib/pair-only";
import { sendOrderMail } from "@/lib/mail";
import { sendOrderTelegram } from "@/lib/telegram";
import {
  isPaymentMethod,
  isDeliveryMethod,
  PAYMENT_LABELS,
  DELIVERY_LABELS,
  type PaymentMethod,
  type DeliveryMethod,
} from "@/lib/order-options";

export const dynamic = "force-dynamic";

// `warehouse` — выбор клиента в корзине (см. lib/order-warehouses.ts).
// Сервер его проверяет и, если выбор пуст или устарел, подставляет свой.
type IncomingItem = {
  productId: string;
  qty: number;
  warehouse?: string | null;
};

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

  let body: {
    items?: IncomingItem[];
    comment?: string;
    paymentMethod?: string;
    deliveryMethod?: string;
  };
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

  // Склады клиента по каждой позиции: выбор из корзины принимается, только
  // если склад всё ещё доступен и с остатком, иначе подставляется свой.
  const whOptions = await warehouseOptionsFor(
    session.sub,
    incoming.map((i) => i.productId)
  );

  let total = 0;
  const orderItems: {
    productId: string;
    sku: string;
    name: string;
    price: number;
    qty: number;
    isGift: boolean;
    warehouse: string | null;
  }[] = [];
  // Строки для 1С идут параллельным списком: у каждой свой склад, по нему
  // заказ разбивается на документы.
  const onecProducts: {
    code: string | null;
    sku: string;
    qty: number;
    price: number;
    warehouse: string | null;
  }[] = [];
  const qtyById = new Map<string, number>();
  for (const i of incoming) {
    const p = byId.get(i.productId);
    if (!p) continue;
    let qty = Math.min(MAX_QTY, Math.max(1, Math.trunc(Number(i.qty) || 1)));
    // «Диски UIDNU» are sold strictly in pairs — snap to even (min 2).
    if (isPairOnly(p.category)) qty = snapPairQty(qty);
    const price = Math.round(Number(p.price) * (1 - disc.pctFor(p) / 100));
    const warehouse = pickWarehouse(whOptions.get(p.id), i.warehouse);
    total += price * qty;
    qtyById.set(p.id, (qtyById.get(p.id) ?? 0) + qty);
    orderItems.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      price,
      qty,
      isGift: false,
      warehouse,
    });
    onecProducts.push({ code: p.code, sku: p.sku, qty, price, warehouse });
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
    const giftIds = [...earned.keys()];
    const [giftProducts, giftWh] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: giftIds } } }),
      warehouseOptionsFor(session.sub, giftIds),
    ]);
    // Подарок едет со склада, где он лежит; если остатка нигде нет — цепляем
    // его к складу первой оплаченной строки, чтобы он не уехал отдельным
    // документом «без склада» и не потерялся у менеджера.
    const fallbackWh = orderItems[0]?.warehouse ?? null;
    for (const gp of giftProducts) {
      const giftQty = earned.get(gp.id) ?? 1;
      const warehouse = pickWarehouse(giftWh.get(gp.id)) ?? fallbackWh;
      orderItems.push({
        productId: gp.id,
        sku: gp.sku,
        name: gp.name,
        price: 0,
        qty: giftQty,
        isGift: true,
        warehouse,
      });
      onecProducts.push({
        code: gp.code,
        sku: gp.sku,
        qty: giftQty,
        price: 0,
        warehouse,
      });
    }
  }

  const paymentMethod: PaymentMethod = isPaymentMethod(body.paymentMethod)
    ? body.paymentMethod
    : "CASH";
  const deliveryMethod: DeliveryMethod = isDeliveryMethod(body.deliveryMethod)
    ? body.deliveryMethod
    : "DELIVERY";

  const order = await prisma.order.create({
    data: {
      userId: session.sub,
      status: "NEW",
      comment: body.comment?.trim() || null,
      paymentMethod,
      deliveryMethod,
      total,
      items: { create: orderItems },
    },
  });

  // Сумма заказа сразу становится долгом клиента: баланс = сумма (total −
  // paid) по его заказам и уменьшится, только когда админ или бухгалтер
  // проставит оплату в разделе «Заказы».
  await recalcUserBalance(session.sub).catch((e) =>
    // Заказ уже сохранён и ушёл в 1С — падать из-за баланса нельзя, но и
    // молча терять расхождение тоже: следующая правка заказа его починит.
    console.error(`[balance] Заказ ${order.id}: баланс не пересчитан — ${e}`)
  );

  const manager = me?.manager ?? null;
  const orderNo = order.id.slice(-6).toUpperCase();

  // Push the order to 1С (best-effort: the order is already saved locally).
  //
  // Товары с разных складов уходят РАЗНЫМИ документами — по одному на склад:
  // на «БК склад» и «БК склад 2» заказ собирают разные люди, и общая заявка
  // им не годится. Когда склад один (обычный случай), уходит ровно один
  // документ с прежним номером — поведение не меняется.
  const whGroups = groupByWarehouse(onecProducts, (p) => p.warehouse);
  const split = whGroups.length > 1;
  const onecResults: { warehouse: string | null; ok: boolean; number?: string; error?: string }[] =
    [];

  for (const [idx, group] of whGroups.entries()) {
    // Номер документа: при разбивке — с суффиксом, иначе 1С может посчитать
    // документы одним заказом и перезаписать предыдущий.
    const siteOrderId = split ? `${orderNo}-${idx + 1}` : orderNo;
    const res = await sendOrderToOneC({
      site_order_id: siteOrderId,
      client_name: me?.fullName ?? "",
      client_phone: me?.phone ?? "",
      warehouse: group.warehouse,
      // Склад в комментарий НЕ пишем — он едет отдельным полем `warehouse`,
      // а в комментарии заказчику нужен только адрес и его собственный текст.
      comment: buildOneCComment({
        pickup: deliveryMethod === "PICKUP",
        city: me?.city,
        address: me?.address,
        comment: body.comment,
      }),
      products: group.lines.map((l) => ({
        code: l.code,
        sku: l.sku,
        qty: l.qty,
        price: l.price,
      })),
    });
    onecResults.push({
      warehouse: group.warehouse,
      ok: res.ok,
      number: res.orderNumber,
      error: res.error,
    });
    if (!res.ok) {
      console.warn(
        `[1c] Заказ №${siteOrderId} (склад «${group.warehouse ?? "не определён"}»): НЕ отправлен — ${res.error ?? "причина неизвестна"}`
      );
    }
  }

  const onecOk = onecResults.every((r) => r.ok);
  const onecNumbers = onecResults
    .filter((r) => r.ok && r.number)
    .map((r) => r.number as string);
  if (onecNumbers.length > 0 || onecOk) {
    await prisma.order
      .update({
        where: { id: order.id },
        data: {
          onecSent: onecOk,
          onecNumber: onecNumbers.length > 0 ? onecNumbers.join(", ") : null,
        },
      })
      .catch(() => {});
  }
  if (split) {
    console.log(
      `[1c] Заказ №${orderNo} разбит по складам на ${whGroups.length} док.: ` +
        onecResults
          .map(
            (r) =>
              `${r.warehouse ?? "без склада"} — ${r.ok ? r.number ?? "ok" : "ошибка"}`
          )
          .join("; ")
    );
  }
  const onec = { ok: onecOk };

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
    `:\n${lines.join("\n")}` +
    `\n\nИтого: ${formatTenge(total)}` +
    `\nОплата: ${PAYMENT_LABELS[paymentMethod]}` +
    `\nПолучение: ${DELIVERY_LABELS[deliveryMethod]}` +
    (body.comment?.trim() ? `\nКомментарий: ${body.comment.trim()}` : "");

  const waLink = manager?.phone ? buildWaLink(manager.phone, text) : null;

  // «Направление» в письме — склад, с которого позиция реально заказана
  // (выбор клиента или авто-подстановка). Раньше сюда шли ВСЕ склады с
  // остатком, и менеджер не понимал, откуда везти.
  const whByProduct = new Map<string, string[]>();
  for (const i of orderItems) {
    if (i.warehouse) whByProduct.set(i.productId, [i.warehouse]);
  }

  // Notify the assigned manager by e-mail. Best-effort: a mail outage must
  // never fail an order that is already saved and pushed to 1С.
  const mail = await sendOrderMail({
    orderNo,
    createdAt: order.createdAt,
    total,
    paymentMethod,
    deliveryMethod,
    comment: body.comment?.trim() || null,
    client: {
      fullName: me?.fullName ?? "",
      login: me?.login ?? "",
      email: me?.email ?? null,
      phone: me?.phone ?? null,
      city: me?.city ?? null,
      address: me?.address ?? null,
    },
    manager: manager
      ? { fullName: manager.fullName, email: manager.email }
      : null,
    items: orderItems.map((i) => ({
      sku: i.sku,
      name: i.name,
      qty: i.qty,
      price: i.price,
      isGift: i.isGift,
      warehouses: whByProduct.get(i.productId) ?? [],
    })),
  }).catch((e) => ({ ok: false, error: String(e) }));

  // Письмо — best-effort, но молчать о сбое нельзя: без этой строки в логах
  // «почта не работает» невозможно отличить от «SMTP не настроен» или «у
  // менеджера не заполнен e-mail».
  if (mail.ok) {
    console.log(
      `[mail] Заказ №${orderNo}: письмо отправлено на ${manager?.email ?? process.env.ORDER_MAIL_TO}`
    );
  } else {
    console.warn(
      `[mail] Заказ №${orderNo}: письмо НЕ отправлено — ${mail.error ?? "причина неизвестна"}` +
        (manager
          ? ` (менеджер «${manager.fullName}», e-mail: ${manager.email ?? "не заполнен"})`
          : " (за клиентом не закреплён менеджер)")
    );
  }

  // Telegram-уведомление менеджеру — тоже best-effort и с логом причины.
  const mailItems = orderItems.map((i) => ({
    sku: i.sku,
    name: i.name,
    qty: i.qty,
    price: i.price,
    isGift: i.isGift,
    warehouses: whByProduct.get(i.productId) ?? [],
  }));
  const tg = await sendOrderTelegram(
    {
      orderNo,
      total,
      paymentMethod,
      deliveryMethod,
      comment: body.comment?.trim() || null,
      client: {
        fullName: me?.fullName ?? "",
        login: me?.login ?? "",
        email: me?.email ?? null,
        phone: me?.phone ?? null,
        city: me?.city ?? null,
        address: me?.address ?? null,
      },
      manager: manager
        ? { fullName: manager.fullName, telegramId: manager.telegramId }
        : null,
    },
    mailItems
  ).catch((e) => ({ ok: false, error: String(e) }));

  if (tg.ok) {
    console.log(
      `[telegram] Заказ №${orderNo}: отправлено менеджеру «${manager?.fullName ?? "—"}»`
    );
  } else {
    console.warn(
      `[telegram] Заказ №${orderNo}: НЕ отправлено — ${tg.error ?? "причина неизвестна"}`
    );
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    orderNo,
    total,
    waLink,
    onecSent: onec.ok,
    mailSent: mail.ok,
    telegramSent: tg.ok,
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
