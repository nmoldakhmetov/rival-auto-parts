import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Картинка QR для экрана оплаты.
//
// Рисуем на сервере: так сам токен не уезжает в разметку страницы, а в
// браузер не тянется библиотека генерации QR. Отдаём SVG — он одинаково
// чёткий и на обычном экране, и на ретине.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payment = await prisma.kaspiPayment.findUnique({
    where: { id: params.id },
    select: { qrToken: true, order: { select: { userId: true } } },
  });
  if (!payment || payment.order.userId !== session.sub || !payment.qrToken) {
    return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });
  }

  const svg = await QRCode.toString(payment.qrToken, {
    type: "svg",
    margin: 1,
    // Средний уровень коррекции: код остаётся читаемым, если экран бликует
    // или его снимают под углом.
    errorCorrectionLevel: "M",
    color: { dark: "#1f1f1f", light: "#ffffff" },
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
