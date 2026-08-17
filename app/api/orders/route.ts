import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { buildWaLink } from "@/lib/whatsapp";
import { formatTenge } from "@/lib/format";
import { getDiscountContext } from "@/lib/pricing";
import { recalcUserBalance } from "@/lib/balance";
import { warehouseOptionsFor, pickWarehouse } from "@/lib/order-warehouses";
import { formatAddress } from "@/lib/addresses";
import { dispatchOrder } from "@/lib/order-dispatch";
import { getActiveGiftRules } from "@/lib/gifts";
import { earnedGiftQty } from "@/lib/gift-earn";
import { isPairOnly, snapPairQty } from "@/lib/pair-only";
import { productTitle } from "@/lib/product-title";
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
    // Какой из своих адресов клиент выбрал для доставки (ClientAddress.id).
    addressId?: string;
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
    // Применяемость на момент заказа: её и только её видит клиент в «Моих
    // заказах». Снимок нужен потому, что товар, пропавший из выгрузки 1С,
    // удаляется — описания в старом заказе иначе не осталось бы.
    fullName: string | null;
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
  // Заказать больше, чем лежит на складе, нельзя. Проверяем на сервере: у
  // клиента остаток выше порога показан как «>70», и точного числа он не
  // знает — верить его расчётам нельзя. Считаем по СУММЕ строк: один товар
  // может прийти двумя строками с одного склада.
  const wantedByLine = new Map<string, number>();
  const overStock: string[] = [];

  for (const i of incoming) {
    const p = byId.get(i.productId);
    if (!p) continue;
    let qty = Math.min(MAX_QTY, Math.max(1, Math.trunc(Number(i.qty) || 1)));
    // «Диски UIDNU» are sold strictly in pairs — snap to even (min 2).
    if (isPairOnly(p.category)) qty = snapPairQty(qty);
    const price = Math.round(Number(p.price) * (1 - disc.pctFor(p) / 100));
    const warehouse = pickWarehouse(whOptions.get(p.id), i.warehouse);

    // Остаток именно того склада, с которого заказывают.
    const available =
      (whOptions.get(p.id) ?? []).find((o) => o.name === warehouse)?.qty ?? 0;
    const lineKey = `${p.id} ${warehouse ?? ""}`;
    const wanted = (wantedByLine.get(lineKey) ?? 0) + qty;
    wantedByLine.set(lineKey, wanted);
    if (wanted > available) {
      overStock.push(
        `${p.sku} — на складе «${warehouse ?? "не определён"}» ${available} шт, в заказе ${wanted}`
      );
    }

    total += price * qty;
    qtyById.set(p.id, (qtyById.get(p.id) ?? 0) + qty);
    orderItems.push({
      productId: p.id,
      sku: p.sku,
      name: p.name,
      fullName: p.fullName,
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

  // Заказ целиком не принимаем: молча урезать количество нельзя — клиент
  // рассчитывает на объём, а менеджер получил бы не тот заказ.
  if (overStock.length > 0) {
    return NextResponse.json(
      {
        error:
          "Столько нет на складе:\n" +
          overStock.join("\n") +
          "\nУменьшите количество в корзине.",
        overStock,
      },
      { status: 409 }
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
        fullName: gp.fullName,
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

  // Адрес доставки: берём выбранный клиентом (проверив, что адрес его),
  // иначе основной из списка, иначе — то, что записано в карточке. Строка
  // сохраняется в заказе снимком: адрес в карточке потом поменяют, а в
  // заказе должен остаться тот, по которому везли.
  let deliveryAddress: string | null = null;
  if (deliveryMethod === "DELIVERY") {
    const chosen = body.addressId
      ? await prisma.clientAddress.findFirst({
          where: { id: String(body.addressId), userId: session.sub },
          select: { city: true, address: true },
        })
      : null;
    const fallback =
      chosen ??
      (await prisma.clientAddress.findFirst({
        where: { userId: session.sub },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: { city: true, address: true },
      }));
    deliveryAddress = fallback
      ? formatAddress(fallback)
      : formatAddress({ city: me?.city, address: me?.address });
    if (!deliveryAddress) deliveryAddress = null;
  }

  const order = await prisma.order.create({
    data: {
      userId: session.sub,
      status: "NEW",
      comment: body.comment?.trim() || null,
      paymentMethod,
      deliveryMethod,
      deliveryAddress,
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

  // Отправка наружу (1С, письмо, Telegram) вынесена в lib/order-dispatch,
  // потому что её момент зависит от способа оплаты:
  //   • наличные / перевод — сразу, как было всегда;
  //   • Kaspi Pay — только после успешной оплаты (её проводит роут статуса
  //     платежа). Неоплаченный заказ в 1С не нужен: там его начнут собирать,
  //     а денег нет.
  const deferred = paymentMethod === "KASPI";
  const dispatched = deferred
    ? { onecOk: false, mailOk: false, telegramOk: false }
    : await dispatchOrder(order.id).catch((e) => {
        console.error(`[order] Заказ ${orderNo}: отправка не удалась — ${e}`);
        return { onecOk: false, mailOk: false, telegramOk: false };
      });

  // Big orders would blow past URL limits (~2K chars) and break the wa.me
  // link entirely — cap the message; the full order is always in the portal.
  const MAX_WA_LINES = 40;
  // Письмо открывается в WhatsApp У КЛИЕНТА — значит, и здесь применяемость,
  // а не служебное имя из 1С. Менеджеру хватает артикула: он у строки первый.
  const lines = orderItems.slice(0, MAX_WA_LINES).map((i, idx) => {
    const title = productTitle({ fullName: i.fullName, name: i.name }, "CLIENT");
    return `${idx + 1}. ${i.sku}${title ? ` — ${title}` : ""} × ${i.qty} шт.${
      i.isGift ? " (подарок)" : ""
    }`;
  });
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

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    orderNo,
    total,
    waLink,
    // У Kaspi-заказа отправка отложена до оплаты — так и отвечаем.
    onecSent: dispatched.onecOk,
    mailSent: dispatched.mailOk,
    telegramSent: dispatched.telegramOk,
    dispatchDeferred: deferred,
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
