import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import BroadcastsManager from "@/components/admin/BroadcastsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Рассылки — Админ-панель" };

export default async function AdminBroadcastsPage() {
  const session = await getSession();
  const mgrId = session?.role === "MANAGER" ? session.sub : null;

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", ...(mgrId ? { managerId: mgrId } : {}) },
    select: { id: true, fullName: true, login: true, city: true },
    orderBy: { fullName: "asc" },
  });

  // Managers may only send to their own clients — no «всем клиентам».
  return <BroadcastsManager clients={clients} ownClientsOnly={!!mgrId} />;
}
