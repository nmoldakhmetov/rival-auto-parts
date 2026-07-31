import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import ClientsManager from "@/components/admin/ClientsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Клиенты — Админ-панель" };

export default async function AdminClientsPage() {
  const session = await getSession();
  const mgrId = session?.role === "MANAGER" ? session.sub : null;
  // Only owner-level staff get the Managers/Accountants/RA tabs.
  const isOwner = session?.role === "ADMIN" || session?.role === "RA";

  const [clientsRaw, managers, warehouses, staffRaw] = await Promise.all([
    prisma.user.findMany({
      // Manager sees only their own clients.
      where: { role: "CLIENT", ...(mgrId ? { managerId: mgrId } : {}) },
      include: { warehouseAccess: { select: { warehouseId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      // A manager may only (re)assign clients to themselves.
      where: { role: "MANAGER", ...(mgrId ? { id: mgrId } : {}) },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.warehouse.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Staff directory (managers / accountants / RA) for the filter tabs.
    isOwner
      ? prisma.user.findMany({
          where: { role: { in: ["MANAGER", "ACCOUNTANT", "RA"] } },
          select: {
            id: true,
            login: true,
            fullName: true,
            email: true,
            phone: true,
            telegramId: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: [{ role: "asc" }, { fullName: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const initialClients = clientsRaw.map((c) => ({
    id: c.id,
    login: c.login,
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    address: c.address,
    city: c.city,
    balance: Number(c.balance),
    discountPercent: c.discountPercent,
    comment: c.comment,
    createdAt: c.createdAt.toISOString(),
    isActive: c.isActive,
    managerId: c.managerId,
    access: c.warehouseAccess.map((a) => a.warehouseId),
  }));

  const initialStaff = staffRaw.map((s) => ({
    id: s.id,
    login: s.login,
    fullName: s.fullName,
    email: s.email,
    phone: s.phone,
    telegramId: s.telegramId,
    role: s.role as "MANAGER" | "ACCOUNTANT" | "RA",
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <ClientsManager
      initialClients={initialClients}
      initialManagers={managers}
      initialStaff={initialStaff}
      warehouses={warehouses}
      viewerRole={session?.role ?? "CLIENT"}
    />
  );
}
