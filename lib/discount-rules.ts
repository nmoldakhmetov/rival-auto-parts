// Shared validation/normalization for discount-rule payloads, used by both
// /api/admin/discounts and /api/admin/discounts/[id]. Kept out of the route
// files so Next.js doesn't treat it as an unexpected route export.

export type RuleBody = {
  name?: string;
  kind?: "DISCOUNT" | "MARKUP";
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
export type RuleKindT = "DISCOUNT" | "MARKUP";

export type NormalizedRule = {
  name: string | null;
  kind: RuleKindT;
  percent: number;
  userId: string | null;
  target: DiscountTargetT;
  category: string | null;
  brand: string | null;
  active: boolean;
  productIds: string[];
};

// Одному клиенту — одна скидка на одну и ту же область.
//
// Менеджеры путались и выдавали клиенту вторую скидку вместо правки первой:
// в ценообразовании берётся ЛУЧШАЯ (max), поэтому лишнее правило просто
// висит и сбивает с толку. Дубликатом считаем активное правило того же вида
// (скидка/наценка) и той же области у того же клиента. Правила на разные
// категории/марки не мешают друг другу, поэтому у них в ключ входит ещё и
// сама категория/марка; адресные правила на ТОВАРЫ не ограничиваем — там
// пересечение определяется составом списка.
export function duplicateScopeOf(data: NormalizedRule) {
  if (data.target === "PRODUCT") return null;
  return {
    userId: data.userId,
    kind: data.kind,
    target: data.target,
    category: data.category,
    brand: data.brand,
    active: true,
  };
}

export function duplicateRuleMessage(data: NormalizedRule): string {
  const what = data.kind === "MARKUP" ? "наценка" : "скидка";
  const where =
    data.target === "ALL"
      ? "на все товары"
      : data.target === "CATEGORY"
        ? `на категорию «${data.category}»`
        : `на марку «${data.brand}»`;
  const who = data.userId ? "у этого клиента" : "для всех клиентов";
  return `Уже есть активная ${what} ${where} ${who}. Отредактируйте её или отключите — вторая такая же не нужна, в цене всё равно применится только лучшая.`;
}

export function normalizeRule(
  body: RuleBody
): { error: string } | { data: NormalizedRule } {
  const kind: RuleKindT = body.kind === "MARKUP" ? "MARKUP" : "DISCOUNT";
  const percent = Math.trunc(Number(body.percent));
  if (!Number.isFinite(percent) || percent < 1 || percent > 95) {
    return {
      error:
        kind === "MARKUP"
          ? "Процент наценки должен быть от 1 до 95"
          : "Процент скидки должен быть от 1 до 95",
    };
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
      kind,
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
