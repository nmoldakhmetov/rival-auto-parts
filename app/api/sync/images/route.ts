import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prefetchAllImages, countCached } from "@/lib/image-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Authorized by X-Sync-Token header or an ADMIN session (under /api/sync/*,
// which middleware lets through).
async function authorize(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("x-sync-token");
  if (token && process.env.SYNC_SECRET && token === process.env.SYNC_SECRET) {
    return true;
  }
  const session = await getSession();
  return session?.role === "ADMIN";
}

// Cache stats.
export async function GET(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [cached, withImage] = await Promise.all([
    countCached(),
    prisma.product.count({ where: { imageUrl: { not: null } } }),
  ]);
  return NextResponse.json({ cached, withImage });
}

// Bulk-download all product images into the cache.
export async function POST(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await prefetchAllImages();
  return NextResponse.json(result, { status: result.aborted ? 502 : 200 });
}
