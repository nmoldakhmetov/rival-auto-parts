import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Catalog from "@/components/Catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Акции — Rival Auto Parts" };

// «Акции»: the full catalog experience scoped to promo products only —
// gift-trigger items pinned first, then 1С-discounted ones (see the promo
// branch of /api/products/search).
export default async function PromotionsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let hasNoAccess = false;
  if (session.role === "CLIENT") {
    const count = await prisma.clientWarehouseAccess.count({
      where: { userId: session.sub },
    });
    hasNoAccess = count === 0;
  }

  // Single compact header — rendered by the Catalog's own slim header bar.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="p-6 text-sm text-muted">Загрузка товаров…</div>
          }
        >
          <Catalog
            role={session.role}
            hasNoAccess={hasNoAccess}
            promoOnly
            heading="Акции и подарки"
            subheading="Товары, за покупку которых полагается подарок, и товары со скидкой."
          />
        </Suspense>
      </div>
    </div>
  );
}
