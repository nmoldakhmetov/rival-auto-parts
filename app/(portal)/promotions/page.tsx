import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BadgePercent } from "lucide-react";
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Promo banner */}
      <div className="border-b border-line bg-white px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <BadgePercent size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-ink">
              Акции и подарки
            </h1>
            <p className="mt-0.5 max-w-3xl text-sm leading-relaxed text-muted">
              Товары, за покупку которых полагается подарок, и товары со
              скидкой. Подарочные предложения — всегда в начале списка.
            </p>
          </div>
        </div>
      </div>

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
            heading="Акционные товары"
            subheading="Сначала — товары с подарком, затем — со скидкой"
          />
        </Suspense>
      </div>
    </div>
  );
}
