import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Catalog from "@/components/Catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Каталог — Rival Auto Parts" };

export default async function CatalogPage() {
  const session = await getSession();
  const role = session?.role ?? "CLIENT";

  let hasNoAccess = false;
  if (role === "CLIENT" && session) {
    const count = await prisma.clientWarehouseAccess.count({
      where: { userId: session.sub },
    });
    hasNoAccess = count === 0;
  }

  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-muted">Загрузка каталога…</div>}
    >
      <Catalog role={role} hasNoAccess={hasNoAccess} />
    </Suspense>
  );
}
