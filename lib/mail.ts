import "server-only";
import nodemailer from "nodemailer";
import { formatTenge } from "@/lib/format";
import {
  PAYMENT_LABELS,
  DELIVERY_LABELS,
  type PaymentMethod,
  type DeliveryMethod,
} from "@/lib/order-options";

// Order notification for the manager the client is assigned to.
//
// Configured through env; when SMTP is not set up the send is skipped and the
// order still goes through — a mail outage must never block a sale.
//
//   SMTP_HOST      smtp.gmail.com (по умолчанию)
//   SMTP_PORT      465 (по умолчанию, SSL)
//   SMTP_USER      ящик компании, напр. rivalautokz@gmail.com
//   SMTP_PASSWORD  пароль приложения Google (не обычный пароль!)
//   MAIL_FROM      «Rival Auto» <rivalautokz@gmail.com> (по умолчанию SMTP_USER)
//   ORDER_MAIL_TO  запасной адрес, если у клиента нет менеджера с e-mail
//   SITE_NAME      www.rivalauto.kz (по умолчанию)

export type OrderMailItem = {
  sku: string;
  name: string;
  qty: number;
  price: number;
  isGift: boolean;
  // «Направление» — склады с остатком, к которым у клиента есть доступ.
  // Считается на момент письма (в заказе склад не фиксируется).
  warehouses: string[];
};

export type OrderMailData = {
  orderNo: string;
  createdAt: Date;
  total: number;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  comment: string | null;
  client: {
    fullName: string;
    login: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    address: string | null;
  };
  manager: { fullName: string; email: string | null } | null;
  items: OrderMailItem[];
};

const SITE = process.env.SITE_NAME || "www.rivalauto.kz";

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function transporter() {
  const port = parseInt(process.env.SMTP_PORT ?? "465", 10) || 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASSWORD as string,
    },
  });
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function row(label: string, value: string | null | undefined) {
  if (!value) return "";
  return `<tr>
    <td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top">${esc(label)}</td>
    <td style="padding:4px 0;color:#1f1f1f"><b>${esc(value)}</b></td>
  </tr>`;
}

export function buildOrderMail(d: OrderMailData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Оформление заказа № ${d.orderNo} на сайте ${SITE}`;
  const pickup = d.deliveryMethod === "PICKUP";
  const fullAddress = [d.client.city, d.client.address]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const cell = "padding:8px;border-bottom:1px solid #e5e7eb";
  const itemRows = d.items
    .map((i) => {
      const inStock = i.warehouses.length > 0;
      return `<tr>
        <td style="${cell}">
          <b>${esc(i.sku)}</b><br><span style="color:#6b7280;font-size:12px">${esc(i.name)}</span>
          ${i.isGift ? '<br><span style="color:#16a34a;font-size:12px;font-weight:bold">подарок</span>' : ""}
        </td>
        <td style="${cell};text-align:center">${i.qty}</td>
        <td style="${cell};text-align:center;color:${inStock ? "#15803d" : "#b45309"}">${
          inStock ? "в наличии" : "под заказ"
        }</td>
        <td style="${cell};font-size:12px">${esc(i.warehouses.join(", ") || "—")}</td>
        <td style="${cell};text-align:center">${i.qty}</td>
        <td style="${cell};text-align:right"><b>${
          i.isGift ? "Бесплатно" : esc(formatTenge(i.price * i.qty))
        }</b></td>
      </tr>`;
    })
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f1f1f;max-width:680px">
  <h2 style="margin:0 0 4px;font-size:18px">Оформление заказа № ${esc(d.orderNo)}</h2>
  <div style="color:#6b7280;font-size:12px;margin-bottom:16px">на сайте ${esc(SITE)}</div>

  <h3 style="font-size:15px;margin:0 0 6px">Информация о клиенте</h3>
  <table cellpadding="0" cellspacing="0" style="font-size:13px;margin-bottom:18px">
    ${row("Клиент", d.client.fullName)}
    ${row("Контактное лицо (ФИО)", d.client.fullName)}
    ${row("Телефоны", d.client.phone)}
    ${row("Email", d.client.email)}
    ${row("Способ оплаты", PAYMENT_LABELS[d.paymentMethod])}
    ${row("Способ доставки", DELIVERY_LABELS[d.deliveryMethod])}
    ${pickup ? "" : row("Адрес доставки", fullAddress || "—")}
  </table>

  <h3 style="font-size:15px;margin:0 0 6px">Содержание заказа</h3>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr style="background:#f7f7f8">
        <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb">Наименование детали</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid #e5e7eb;width:80px">Заказано</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid #e5e7eb;width:90px">Срок</th>
        <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb;width:130px">Направление</th>
        <th style="padding:8px;text-align:center;border-bottom:1px solid #e5e7eb;width:70px">Кол-во</th>
        <th style="padding:8px;text-align:right;border-bottom:1px solid #e5e7eb;width:120px">Сумма</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div style="margin:14px 0 20px;text-align:right;font-size:16px">
    Общая сумма заказа: <b>${esc(formatTenge(d.total))}</b>
  </div>

  ${
    d.comment
      ? `<div style="padding:10px 12px;background:#f7f7f8;border-radius:8px;font-size:13px;margin-bottom:18px">
           <span style="color:#6b7280">Комментарий клиента:</span> ${esc(d.comment)}
         </div>`
      : ""
  }

  <div style="color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:10px">
    С уважением, Администрация сайта ${esc(SITE)}
  </div>
</div>`;

  const text = [
    `Оформление заказа № ${d.orderNo} на сайте ${SITE}`,
    "",
    "Информация о клиенте",
    `  Клиент: ${d.client.fullName}`,
    `  Контактное лицо (ФИО): ${d.client.fullName}`,
    d.client.phone ? `  Телефоны: ${d.client.phone}` : "",
    d.client.email ? `  Email: ${d.client.email}` : "",
    `  Способ оплаты: ${PAYMENT_LABELS[d.paymentMethod]}`,
    `  Способ доставки: ${DELIVERY_LABELS[d.deliveryMethod]}`,
    pickup ? "" : `  Адрес доставки: ${fullAddress || "—"}`,
    "",
    "Содержание заказа",
    ...d.items.map(
      (i) =>
        `  ${i.sku} — ${i.name} × ${i.qty} шт. — ` +
        `${i.warehouses.length ? "в наличии" : "под заказ"}` +
        `${i.warehouses.length ? ` (${i.warehouses.join(", ")})` : ""} — ` +
        `${i.isGift ? "подарок" : formatTenge(i.price * i.qty)}`
    ),
    "",
    `Общая сумма заказа: ${formatTenge(d.total)}`,
    d.comment ? `Комментарий клиента: ${d.comment}` : "",
    "",
    `С уважением, Администрация сайта ${SITE}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}

export async function sendOrderMail(
  d: OrderMailData
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const to = d.manager?.email || process.env.ORDER_MAIL_TO;
  if (!mailConfigured()) return { ok: false, skipped: true, error: "SMTP не настроен" };
  if (!to) return { ok: false, skipped: true, error: "Некому отправлять: у менеджера нет e-mail" };

  const { subject, html, text } = buildOrderMail(d);
  try {
    await transporter().sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      replyTo: d.client.email || undefined,
      subject,
      html,
      text,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
