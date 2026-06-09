import { prisma } from "@/lib/prisma";
import DiscountsManager from "@/components/admin/DiscountsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Скидки — Админ-панель" };

export default async function AdminDiscountsPage() {
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    select: { id: true, fullName: true, login: true, city: true },
    orderBy: { fullName: "asc" },
  });

  return <DiscountsManager clients={clients} />;
}
