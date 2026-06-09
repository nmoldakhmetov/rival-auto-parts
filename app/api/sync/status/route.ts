import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSyncState } from "@/lib/sync-runner";
import { getScheduleInfo } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

// Auto-sync status for the admin dashboard. (Lives under /api/sync/* which
// middleware lets through, so we enforce ADMIN here.)
export async function GET() {
  const session = await getSession();
  if (session?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    state: getSyncState(),
    schedule: getScheduleInfo(),
  });
}
