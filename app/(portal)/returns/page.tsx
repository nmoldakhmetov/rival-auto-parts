import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ReturnsClient from "@/components/ReturnsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Возвраты — Rival Auto Parts" };

export default async function ReturnsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "CLIENT") redirect("/");

  const orders = await prisma.order.findMany({
    where: { userId: session.sub },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const seen = new Set<string>();
  const orderItems: {
    productId: string | null;
    sku: string;
    name: string;
    price: number;
  }[] = [];
  for (const o of orders) {
    for (const it of o.items) {
      const key = it.productId ?? it.sku;
      if (seen.has(key)) continue;
      seen.add(key);
      orderItems.push({
        productId: it.productId,
        sku: it.sku,
        name: it.name,
        price: Number(it.price),
      });
    }
  }

  const access = await prisma.clientWarehouseAccess.findMany({
    where: { userId: session.sub },
    include: { warehouse: { select: { name: true } } },
  });
  const warehouses = access.map((a) => a.warehouse.name);

  return <ReturnsClient orderItems={orderItems} warehouses={warehouses} />;
}
