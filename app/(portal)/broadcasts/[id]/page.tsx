import { Suspense } from "react";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Megaphone, ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Catalog from "@/components/Catalog";

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
      {/* Broadcast banner */}
      <div className="border-b border-line bg-white px-6 py-4">
        <Link
          href="/catalog"
          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-accent"
        >
          <ArrowLeft size={13} /> В общий каталог
        </Link>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Megaphone size={19} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-ink">
              {b.title || "Рассылка"}
            </h1>
            <div className="mt-0.5 text-[11px] text-muted">{date}</div>
            <p className="mt-1.5 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-ink/85">
              {b.text}
            </p>
          </div>
        </div>
      </div>

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
