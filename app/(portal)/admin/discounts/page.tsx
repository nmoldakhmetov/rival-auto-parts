import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import DiscountsManager from "@/components/admin/DiscountsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Скидки — Админ-панель" };

export default async function AdminDiscountsPage() {
  const session = await getSession();
  const mgrId = session?.role === "MANAGER" ? session.sub : null;

  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", ...(mgrId ? { managerId: mgrId } : {}) },
    select: { id: true, fullName: true, login: true, city: true },
    orderBy: { fullName: "asc" },
  });

  // Managers can only target their own clients — no «всем клиентам».
  return <DiscountsManager clients={clients} ownClientsOnly={!!mgrId} />;
}
