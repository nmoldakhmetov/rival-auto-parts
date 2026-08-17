// Payment / delivery options chosen by the client in the cart. Shared by the
// cart UI, the order API, the 1С comment and the manager e-mail, so the
// wording is identical everywhere.

export type PaymentMethod = "CASH" | "TRANSFER" | "KASPI";
export type DeliveryMethod = "DELIVERY" | "PICKUP";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Наличный расчёт",
  TRANSFER: "Перевод",
  // Онлайн-оплата на сайте. В 1С и менеджеру важно, что деньги уже пришли,
  // поэтому способ называется именно так, а не «Kaspi» вообще.
  KASPI: "Kaspi Pay (онлайн)",
};

export const DELIVERY_LABELS: Record<DeliveryMethod, string> = {
  DELIVERY: "Доставка",
  PICKUP: "Самовывоз",
};

// Способы, которые клиент выбирает вручную. Kaspi Pay сюда не входит: он
// показывается отдельной кнопкой и только когда интеграция настроена.
export const PAYMENT_OPTIONS = (
  Object.entries(PAYMENT_LABELS) as [PaymentMethod, string][]
).filter(([k]) => k !== "KASPI");

export const DELIVERY_OPTIONS = Object.entries(DELIVERY_LABELS) as [
  DeliveryMethod,
  string,
][];

export function isPaymentMethod(v: unknown): v is PaymentMethod {
  return v === "CASH" || v === "TRANSFER" || v === "KASPI";
}

export function isDeliveryMethod(v: unknown): v is DeliveryMethod {
  return v === "DELIVERY" || v === "PICKUP";
}
