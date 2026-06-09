import { prisma } from "@/lib/prisma";
import BroadcastsManager from "@/components/admin/BroadcastsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Рассылки — Админ-панель" };

export default async function AdminBroadcastsPage() {
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: { id: true, fullName: true, login: true, city: true },
    orderBy: { fullName: "asc" },
  });

  return <BroadcastsManager clients={clients} />;
}
