// «Диски UIDNU» are sold strictly in pairs: the card shows the price for 2,
// the qty selector steps by 2, and both the cart mirror and order placement
// snap quantities to even numbers. Pure/shared (client + server).

const PAIR_ONLY_CATEGORY = "диски uidnu";

export const PAIR_STEP = 2;

export function isPairOnly(category: string | null | undefined): boolean {
  return (category ?? "").trim().toLowerCase() === PAIR_ONLY_CATEGORY;
}

// Snap any requested quantity to the nearest valid pair count (≥2, even).
export function snapPairQty(qty: number): number {
  const n = Math.max(PAIR_STEP, Math.trunc(qty) || PAIR_STEP);
  return n % 2 ? n + 1 : n;
}
