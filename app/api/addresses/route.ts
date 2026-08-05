import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addressesOf } from "@/lib/addresses";

export const dynamic = "force-dynamic";

// GET /api/addresses → адреса доставки текущего клиента для выбора в корзине.
// Только чтение: список ведёт персонал в карточке клиента, чтобы в 1С не
// уезжали адреса, набранные на бегу с ошибками.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "CLIENT") return NextResponse.json({ addresses: [] });
  return NextResponse.json({ addresses: await addressesOf(session.sub) });
}
