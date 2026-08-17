import "server-only";
import { prisma } from "@/lib/prisma";
import { buildOneCComment, sendOrderToOneC } from "@/lib/onec-orders";
import { groupByWarehouse } from "@/lib/order-warehouses";
import { formatAddress } from "@/lib/addresses";
import { sendOrderMail } from "@/lib/mail";
import { sendOrderTelegram } from "@/lib/telegram";
import { PAYMENT_LABELS, DELIVERY_LABELS } from "@/lib/order-options";
import type { PaymentMethod, DeliveryMethod } from "@/lib/order-options";

// Отправка оформленного заказа наружу: документы в 1С, письмо и Telegram
// менеджеру.
//
// Вынесено из /api/orders, потому что момент отправки теперь зависит от
// способа оплаты:
//   • наличные / перевод — сразу при оформлении, как было всегда;
//   • Kaspi Pay — ТОЛЬКО после успешной оплаты. Неоплаченный заказ в 1С не
//     нужен: там его начнут собирать, а денег нет.
//
// Всё best-effort и идемпотентно: заказ уже сохранён, повторный вызов по
// заказу, который уже ушёл (onecSent), ничего не делает.

export type DispatchResult = {
  skipped?: "already-sent";
  onecOk: boolean;
  mailOk: boolean;
  telegramOk: boolean;
};

export async function dispatchOrder(orderId: string): Promise<DispatchResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: { select: { code: true } } } },
      user: { include: { manager: true } },
    },
  });
  if (!order) {
    return { onecOk: false, mailOk: false, telegramOk: false };
  }
  if (order.onecSent) {
    return { skipped: "already-sent", onecOk: true, mailOk: true, telegramOk: true };
  }

  const orderNo = order.id.slice(-6).toUpperCase();
  const me = order.user;
  const manager = me?.manager ?? null;
  const total = Number(order.total);
  const paymentMethod = order.paymentMethod as PaymentMethod;
  const deliveryMethod = order.deliveryMethod as DeliveryMethod;

  // ─── 1С: по документу на склад ─────────────────────────────────────────
  const onecProducts = order.items.map((i) => ({
    code: i.product?.code ?? null,
    sku: i.sku,
    qty: i.qty,
    price: Number(i.price),
    warehouse: i.warehouse,
  }));
  const whGroups = groupByWarehouse(onecProducts, (p) => p.warehouse);
  const split = whGroups.length > 1;
  const results: {
    warehouse: string | null;
    ok: boolean;
    number?: string;
    error?: string;
  }[] = [];

  for (const [idx, group] of whGroups.entries()) {
    // При разбивке номер получает суффикс, иначе 1С может счесть документы
    // одним заказом и перезаписать предыдущий.
    const siteOrderId = split ? `${orderNo}-${idx + 1}` : orderNo;
    const res = await sendOrderToOneC({
      site_order_id: siteOrderId,
      client_name: me?.fullName ?? "",
      client_phone: me?.phone ?? "",
      warehouse: group.warehouse,
      comment: buildOneCComment({
        pickup: deliveryMethod === "PICKUP",
        deliveryAddress: order.deliveryAddress,
        comment: order.comment,
      }),
      products: group.lines.map((l) => ({
        code: l.code,
        sku: l.sku,
        qty: l.qty,
        price: l.price,
        warehouse: l.warehouse,
      })),
    });
    results.push({
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

  const onecOk = results.length > 0 && results.every((r) => r.ok);
  const numbers = results.filter((r) => r.ok && r.number).map((r) => r.number as string);
  if (numbers.length > 0 || onecOk) {
    await prisma.order
      .update({
        where: { id: order.id },
        data: {
          onecSent: onecOk,
          onecNumber: numbers.length > 0 ? numbers.join(", ") : null,
        },
      })
      .catch(() => {});
  }
  if (split) {
    console.log(
      `[1c] Заказ №${orderNo} разбит по складам на ${whGroups.length} док.: ` +
        results
          .map((r) => `${r.warehouse ?? "без склада"} — ${r.ok ? r.number ?? "ok" : "ошибка"}`)
          .join("; ")
    );
  }

  // ─── Письмо и Telegram менеджеру ───────────────────────────────────────
  // «Направление» — склад, с которого позиция реально заказана.
  const whByProduct = new Map<string, string[]>();
  for (const i of order.items) {
    if (i.productId && i.warehouse) whByProduct.set(i.productId, [i.warehouse]);
  }
  const items = order.items.map((i) => ({
    sku: i.sku,
    name: i.name,
    qty: i.qty,
    price: Number(i.price),
    isGift: i.isGift,
    warehouses: i.productId ? whByProduct.get(i.productId) ?? [] : [],
  }));

  const mail = await sendOrderMail({
    orderNo,
    createdAt: order.createdAt,
    total,
    paymentMethod,
    deliveryMethod,
    comment: order.comment,
    client: {
      fullName: me?.fullName ?? "",
      login: me?.login ?? "",
      email: me?.email ?? null,
      phone: me?.phone ?? null,
      // Адрес — ВЫБРАННЫЙ при оформлении, а не текущий из карточки.
      city: null,
      address:
        order.deliveryAddress ??
        formatAddress({ city: me?.city, address: me?.address }),
    },
    manager: manager ? { fullName: manager.fullName, email: manager.email } : null,
    items,
  }).catch((e) => ({ ok: false, error: String(e) }));

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

  const tg = await sendOrderTelegram(
    {
      orderNo,
      total,
      paymentMethod,
      deliveryMethod,
      comment: order.comment,
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
    items
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

  return { onecOk, mailOk: mail.ok, telegramOk: tg.ok };
}

// Текст для WhatsApp собирается на стороне заказа (клиент отправляет его сам),
// а подписи способов нужны и здесь — держим один импорт на всех.
export { PAYMENT_LABELS, DELIVERY_LABELS };
