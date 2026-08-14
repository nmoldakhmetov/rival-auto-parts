import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Catalog from "@/components/Catalog";
import BroadcastBanner from "@/components/BroadcastBanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Рассылка — Rival Auto Parts" };

// A broadcast opened FULL-PAGE: its text on top and the products below in
// the real catalog (same cards, filters, sorting, cart) scoped to the
// broadcast — «точь в точь как каталог».
export default async function BroadcastPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const b = await prisma.broadcast.findUnique({
    where: { id: params.id },
    include: {
      recipients: { where: { userId: session.sub }, select: { readAt: true } },
      _count: { select: { products: true } },
    },
  });
  if (!b) notFound();

  const visible =
    session.role !== "CLIENT" || b.isGlobal || b.recipients.length > 0;
  if (!visible) redirect("/");

  // Opening the page counts as reading it.
  if (session.role === "CLIENT" && b.recipients[0]?.readAt == null) {
    await prisma.broadcastRecipient
      .upsert({
        where: {
          broadcastId_userId: { broadcastId: b.id, userId: session.sub },
        },
        update: { readAt: new Date() },
        create: { broadcastId: b.id, userId: session.sub, readAt: new Date() },
      })
      .catch(() => {});
  }

  let hasNoAccess = false;
  if (session.role === "CLIENT") {
    const count = await prisma.clientWarehouseAccess.count({
      where: { userId: session.sub },
    });
    hasNoAccess = count === 0;
  }

  const date = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(b.createdAt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Компактная шапка рассылки: на телефоне она вместе с шапкой каталога
          съедала пол-экрана, а товары начинались за сгибом. */}
      <BroadcastBanner
        title={b.title || "Рассылка"}
        date={date}
        text={b.text ?? ""}
      />

      {/* The broadcast's products with the FULL catalog experience */}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="p-6 text-sm text-muted">Загрузка товаров…</div>
          }
        >
          <Catalog
            role={session.role}
            hasNoAccess={hasNoAccess}
            broadcastId={b.id}
            heading={`Товары рассылки (${b._count.products})`}
            subheading="Фильтры и сортировка работают как в каталоге"
          />
        </Suspense>
      </div>
    </div>
  );
}
