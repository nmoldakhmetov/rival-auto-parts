// Shared validation/normalization for discount-rule payloads, used by both
// /api/admin/discounts and /api/admin/discounts/[id]. Kept out of the route
// files so Next.js doesn't treat it as an unexpected route export.

export type RuleBody = {
  name?: string;
  percent?: number;
  userId?: string | null;
  target?: "ALL" | "PRODUCT" | "CATEGORY" | "BRAND";
  category?: string | null;
  brand?: string | null;
  productIds?: string[];
  active?: boolean;
};

export const DISCOUNT_TARGETS = ["ALL", "PRODUCT", "CATEGORY", "BRAND"] as const;
export type DiscountTargetT = (typeof DISCOUNT_TARGETS)[number];

export type NormalizedRule = {
  name: string | null;
  percent: number;
  userId: string | null;
  target: DiscountTargetT;
  category: string | null;
  brand: string | null;
  active: boolean;
  productIds: string[];
};

export function normalizeRule(
  body: RuleBody
): { error: string } | { data: NormalizedRule } {
  const percent = Math.trunc(Number(body.percent));
  if (!Number.isFinite(percent) || percent < 1 || percent > 95) {
    return { error: "Процент скидки должен быть от 1 до 95" };
  }
  const target = DISCOUNT_TARGETS.includes(body.target as never)
    ? (body.target as DiscountTargetT)
    : "ALL";

  let category: string | null = null;
  let brand: string | null = null;
  let productIds: string[] = [];

  if (target === "CATEGORY") {
    category = body.category?.trim() || null;
    if (!category) return { error: "Выберите категорию" };
  } else if (target === "BRAND") {
    brand = body.brand?.trim() || null;
    if (!brand) return { error: "Выберите марку/бренд" };
  } else if (target === "PRODUCT") {
    productIds = [...new Set((body.productIds ?? []).filter(Boolean))];
    if (productIds.length === 0) return { error: "Выберите хотя бы один товар" };
  }

  return {
    data: {
      name: body.name?.trim() || null,
      percent,
      userId: body.userId?.trim() ? body.userId.trim() : null,
      target,
      category,
      brand,
      active: body.active !== false,
      productIds,
    },
  };
}
