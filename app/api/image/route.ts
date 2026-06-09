import { NextRequest, NextResponse } from "next/server";
import { onecOrigin, rewriteImageHost } from "@/lib/onec";
import {
  cacheKeyFromUrl,
  readCached,
  writeCached,
  detectImageType,
  fetchImageFromOneC,
} from "@/lib/image-cache";

export const dynamic = "force-dynamic";

// Serves a product image: on-disk cache first, then the 1С origin (caching the
// result). This keeps photos visible even while the 1С image service is down.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return new NextResponse("missing u", { status: 400 });

  const origin = onecOrigin();
  let target: URL;
  try {
    target = new URL(rewriteImageHost(raw));
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (!origin || target.origin !== origin) {
    return new NextResponse("forbidden origin", { status: 403 });
  }

  const key = cacheKeyFromUrl(target);

  // 1) Cache hit → serve from disk (no 1С round-trip).
  if (key) {
    const cached = await readCached(key);
    if (cached) {
      return new NextResponse(Uint8Array.from(cached), {
        status: 200,
        headers: {
          "Content-Type": detectImageType(cached),
          "Cache-Control": "public, max-age=604800",
          "X-Cache": "HIT",
        },
      });
    }
  }

  // 2) Miss → fetch from 1С (single attempt: keep failures fast), cache on success.
  const img = await fetchImageFromOneC(raw, { retries: 0, timeoutMs: 15000 });
  if (!img) {
    return new NextResponse("image unavailable", { status: 404 });
  }
  if (key && img.buf.length > 0) {
    void writeCached(key, img.buf);
  }
  return new NextResponse(Uint8Array.from(img.buf), {
    status: 200,
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "public, max-age=604800",
      "X-Cache": "MISS",
    },
  });
}
