// Technical 1С folders that must never appear anywhere in the UI — neither in
// the catalog category filter nor as a product-card badge. Shared by the
// server filters route and the client Catalog component (plain JS, no
// "server-only" so it can be imported on both sides).
export const HIDDEN_CATEGORIES = new Set(["Unused", "Архив папки"]);

// Same values as a plain array (for Prisma `notIn` filters).
export const HIDDEN_CATEGORY_LIST: string[] = [...HIDDEN_CATEGORIES];

// Prisma where-fragment that excludes products in hidden technical folders
// while keeping products with no category at all. Null-safe so uncategorised
// items still show in the catalog.
export const NOT_HIDDEN_CATEGORY = {
  OR: [
    { category: null as string | null },
    { category: { notIn: HIDDEN_CATEGORY_LIST } },
  ],
};

// Returns the category to display, or null if it's a hidden technical folder.
export function visibleCategory(
  c: string | null | undefined
): string | null {
  if (!c) return null;
  return HIDDEN_CATEGORIES.has(c) ? null : c;
}
