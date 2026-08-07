import type { Role } from "@/lib/jwt";

// ─────────────────────────────────────────────────────────────────────────
//  Role-based access control. Pure / Edge-safe (no prisma, no Node APIs) so
//  it can be imported by the middleware AND the client Sidebar.
//
//  Roles:
//   ADMIN       — всё
//   RA          — как админ, но без «Настроек»; видит всех клиентов
//   MANAGER     — ограниченный набор; видит ТОЛЬКО своих клиентов
//   ACCOUNTANT  — бухгалтер; видит всех; набор уже менеджера
//   CLIENT      — витрина (без админки)
// ─────────────────────────────────────────────────────────────────────────

export type AdminSection =
  | "overview"
  | "orders"
  | "returns"
  | "clients"
  | "discounts"
  | "gifts"
  | "broadcasts"
  | "analogs"
  | "stats"
  | "activity"
  | "search-logs"
  | "settings";

// Which roles may open each admin section.
const SECTION_ROLES: Record<AdminSection, Role[]> = {
  overview: ["ADMIN", "RA"],
  orders: ["ADMIN", "RA", "MANAGER", "ACCOUNTANT"],
  returns: ["ADMIN", "RA", "MANAGER", "ACCOUNTANT"],
  clients: ["ADMIN", "RA", "MANAGER", "ACCOUNTANT"],
  discounts: ["ADMIN", "RA", "MANAGER"],
  gifts: ["ADMIN", "RA"],
  broadcasts: ["ADMIN", "RA", "MANAGER"],
  analogs: ["ADMIN", "RA", "MANAGER"],
  stats: ["ADMIN", "RA", "MANAGER", "ACCOUNTANT"],
  activity: ["ADMIN", "RA", "MANAGER", "ACCOUNTANT"],
  "search-logs": ["ADMIN", "RA", "MANAGER", "ACCOUNTANT"],
  settings: ["ADMIN"],
};

export const STAFF_ROLES: Role[] = ["ADMIN", "RA", "MANAGER", "ACCOUNTANT"];

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

export function canAccessSection(role: Role, section: AdminSection): boolean {
  return SECTION_ROLES[section].includes(role);
}

// MANAGER sees only their own clients; everyone else who has the clients tab
// sees all of them.
export function seesAllClients(role: Role): boolean {
  return role === "ADMIN" || role === "RA" || role === "ACCOUNTANT";
}

// Catalog inline pin/badge controls — owner-level staff only.
export function canEditCatalog(role: Role): boolean {
  return role === "ADMIN" || role === "RA";
}

// Map a /admin or /api/admin pathname to its section (longest prefix wins).
const SECTION_PREFIX: { prefix: string; section: AdminSection }[] = [
  { prefix: "orders", section: "orders" },
  { prefix: "returns", section: "returns" },
  { prefix: "clients", section: "clients" },
  { prefix: "users", section: "clients" }, // /api/admin/users ~ clients
  { prefix: "discounts", section: "discounts" },
  { prefix: "gifts", section: "gifts" },
  { prefix: "broadcasts", section: "broadcasts" },
  { prefix: "analogs", section: "analogs" },
  { prefix: "stats", section: "stats" },
  { prefix: "activity", section: "activity" },
  { prefix: "search-logs", section: "search-logs" },
  { prefix: "settings", section: "settings" },
];

// Resolve the section for an admin path. Returns null for the bare /admin
// (overview) and for /api/admin/products (handled via canEditCatalog).
export function sectionForPath(pathname: string): AdminSection | null {
  // strip the /admin or /api/admin head
  const rest = pathname
    .replace(/^\/api\/admin\/?/, "")
    .replace(/^\/admin\/?/, "");
  if (rest === "") return "overview";
  const seg = rest.split("/")[0];
  const hit = SECTION_PREFIX.find((s) => s.prefix === seg);
  return hit ? hit.section : null;
}

// Final gate used by middleware for any /admin or /api/admin path.
export function canAccessAdminPath(role: Role, pathname: string): boolean {
  if (!isStaff(role)) return false;
  // /api/admin/products = inline catalog edits (pin/badge).
  if (pathname.startsWith("/api/admin/products")) return canEditCatalog(role);
  // /api/admin/warehouses = цвета складских плашек. Читать может любой
  // сотрудник (каталог и так показывает эти плашки), менять — владелец;
  // право на запись проверяет сам роут.
  if (pathname.startsWith("/api/admin/warehouses")) return true;
  const section = sectionForPath(pathname);
  if (section) return canAccessSection(role, section);
  // Unknown admin path → allow staff (no specific rule), middleware still
  // requires a session. Conservative default keeps new routes from leaking:
  return false;
}

// First section a staff role can land on (used for redirects away from a
// forbidden section).
export function landingSection(role: Role): AdminSection {
  return canAccessSection(role, "overview") ? "overview" : "orders";
}
