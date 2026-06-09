import { prisma } from "@/lib/prisma";
import AnalogsManager from "@/components/admin/AnalogsManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Аналоги — Админ-панель" };

export default async function AdminAnalogsPage() {
  const total = await prisma.analog.count();
  return <AnalogsManager initialTotal={total} />;
}
