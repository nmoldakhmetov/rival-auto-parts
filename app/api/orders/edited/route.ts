import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/orders/edited → сколько заказов клиента менеджер поправил, а
// клиент их ещё не открывал. По этому счётчику в меню горит бейдж у «Моих
// заказов»: правка состава не должна пройти мимо клиента. Гаснет он на
// странице /orders, где заказы помечаются просмотренными.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "CLIENT") return NextResponse.json({ count: 0 });

  const count = await prisma.order.count({
    where: {
      userId: session.sub,
      editedAt: { not: null },
      editSeenAt: null,
    },
  });
  return NextResponse.json({ count });
}
