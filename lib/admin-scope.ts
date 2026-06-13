import "server-only";
import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";

// Data scoping for the admin area. A MANAGER may only see their own clients
// (User.managerId === manager.id) and everything those clients produced
// (orders, returns, search logs, favorites, carts, views). ADMIN / RA /
// ACCOUNTANT see everyone → empty filter.

export function isManagerScoped(viewer: SessionPayload): boolean {
  return viewer.role === "MANAGER";
}

// Where-fragment for a CLIENT (User) list.
export function clientWhere(viewer: SessionPayload): Prisma.UserWhereInput {
  return viewer.role === "MANAGER" ? { managerId: viewer.sub } : {};
}

// Where-fragment for rows referencing a client through a `user` relation
// (Order, SearchLog, Favorite, SavedCartItem, ProductView…). Returns {} for
// unrestricted roles so it can be spread into an existing `where`.
export function viaUserWhere(
  viewer: SessionPayload
): Prisma.OrderWhereInput {
  return viewer.role === "MANAGER"
    ? { user: { is: { managerId: viewer.sub } } }
    : {};
}

// The User relation filter itself (when you need to merge with other `user`
// conditions, e.g. a text search).
export function managerUserFilter(
  viewer: SessionPayload
): Prisma.UserWhereInput | null {
  return viewer.role === "MANAGER" ? { managerId: viewer.sub } : null;
}

// Ownership guard for by-id mutations: a MANAGER may only touch their own
// clients; other staff may touch anyone. `clientId` is the CLIENT's user id.
export async function managerOwnsClient(
  viewer: SessionPayload,
  clientId: string | null | undefined
): Promise<boolean> {
  if (viewer.role !== "MANAGER") return true;
  if (!clientId) return false;
  const c = await prisma.user.findUnique({
    where: { id: clientId },
    select: { managerId: true },
  });
  return c?.managerId === viewer.sub;
}

// True if every id belongs to one of the manager's clients (other staff: true).
export async function managerOwnsClients(
  viewer: SessionPayload,
  clientIds: string[]
): Promise<boolean> {
  if (viewer.role !== "MANAGER") return true;
  if (clientIds.length === 0) return true;
  const ids = [...new Set(clientIds)];
  const n = await prisma.user.count({
    where: { id: { in: ids }, managerId: viewer.sub },
  });
  return n === ids.length;
}
