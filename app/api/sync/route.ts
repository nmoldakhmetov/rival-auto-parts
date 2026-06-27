import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditCatalog } from "@/lib/permissions";
import { runSync } from "@/lib/sync-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Authorized either by the shared X-Sync-Token header (cron / 1С push) or by
// an authenticated owner-level staff session (ADMIN/RA — the same roles that
// see the "Синхронизировать" button on the admin overview).
async function authorize(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("x-sync-token");
  if (token && process.env.SYNC_SECRET && token === process.env.SYNC_SECRET) {
    return true;
  }
  const session = await getSession();
  return session ? canEditCatalog(session.role) : false;
}

async function handle(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSync("manual");
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
