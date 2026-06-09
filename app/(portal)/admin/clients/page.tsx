import { prisma } from "@/lib/prisma";
import ClientsManager from "@/components/admin/ClientsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Клиенты — Админ-панель" };

export default async function AdminClientsPage() {
  const [clientsRaw, managers, warehouses] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT" },
      include: { warehouseAccess: { select: { warehouseId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "MANAGER" },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.warehouse.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
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

  return (
    <ClientsManager
      initialClients={initialClients}
      initialManagers={managers}
      warehouses={warehouses}
    />
  );
}
