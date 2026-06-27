// Shared validation/normalization for gift-rule payloads, used by both
// /api/admin/gifts and /api/admin/gifts/[id]. Kept out of the route files so
// Next.js doesn't treat it as an unexpected route export.

export type GiftBody = {
  name?: string | null;
  minQty?: number | string;
  triggerIds?: string[];
  giftIds?: string[];
  active?: boolean;
};

export type NormalizedGift = {
  name: string | null;
  minQty: number;
  active: boolean;
  triggerIds: string[];
  giftIds: string[];
};

export function normalizeGift(
  body: GiftBody
): { error: string } | { data: NormalizedGift } {
  const minQty = Math.trunc(Number(body.minQty));
  if (!Number.isFinite(minQty) || minQty < 1 || minQty > 9999) {
    return { error: "Минимальное количество должно быть от 1" };
  }
  const triggerIds = [...new Set((body.triggerIds ?? []).filter(Boolean))];
  const giftIds = [...new Set((body.giftIds ?? []).filter(Boolean))];
  if (triggerIds.length === 0) {
    return { error: "Выберите хотя бы один товар-триггер" };
  }
  if (giftIds.length === 0) {
    return { error: "Выберите хотя бы один товар в подарок" };
  }
  return {
    data: {
      name: body.name?.trim() || null,
      minQty,
      active: body.active !== false,
      triggerIds,
      giftIds,
    },
  };
}
