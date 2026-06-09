import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { onecOrigin, rewriteImageHost } from "@/lib/onec";

// On-disk cache for product images. The 1С image service is flaky (it returns
// 502 / is slow intermittently), so once an image is fetched we persist it and
// serve from disk afterwards — photos stay visible even when 1С is down.

// On Vercel the project dir is read-only — only /tmp is writable (ephemeral,
// per-instance). Locally we keep the persistent on-disk cache in the project.
export const CACHE_DIR = process.env.VERCEL
  ? path.join("/tmp", "rival-image-cache")
  : path.join(process.cwd(), ".image-cache");

/** Stable, filesystem-safe cache key from the image URL's `id` query param. */
export function cacheKeyFromUrl(url: URL): string | null {
  const id = url.searchParams.get("id");
  if (id && /^[a-zA-Z0-9._-]+$/.test(id)) return id;
  return null;
}

export function safeKey(rawUrl: string): string | null {
  try {
    return cacheKeyFromUrl(new URL(rewriteImageHost(rawUrl)));
  } catch {
    return null;
  }
}

export function detectImageType(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "image/jpeg";
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return "image/png";
  if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
    return "image/gif";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return "image/jpeg";
}

export async function readCached(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, key));
  } catch {
    return null;
  }
}

export async function writeCached(key: string, buf: Buffer): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const tmp = path.join(CACHE_DIR, `${key}.${process.pid}.tmp`);
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, path.join(CACHE_DIR, key));
  } catch {
    // ignore cache write failures — caching is best-effort
  }
}

export async function countCached(): Promise<number> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    return files.filter((f) => !f.endsWith(".tmp")).length;
  } catch {
    return 0;
  }
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  const user = process.env.ONEC_API_USER;
  if (user) {
    const pass = process.env.ONEC_API_PASSWORD ?? "";
    h.Authorization = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  }
  return h;
}

/** Fetch a single image from the configured 1С origin. null on failure. */
export async function fetchImageFromOneC(
  rawUrl: string,
  opts: { retries?: number; timeoutMs?: number } = {}
): Promise<{ buf: Buffer; contentType: string } | null> {
  const origin = onecOrigin();
  let target: URL;
  try {
    target = new URL(rewriteImageHost(rawUrl));
  } catch {
    return null;
  }
  if (!origin || target.origin !== origin) return null;

  const retries = opts.retries ?? 0;
  const timeoutMs = opts.timeoutMs ?? 15000;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(target.toString(), {
        headers: authHeaders(),
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) continue;
      const ct = res.headers.get("content-type") || detectImageType(buf);
      return { buf, contentType: ct.startsWith("image/") ? ct : detectImageType(buf) };
    } catch {
      clearTimeout(timer);
    }
  }
  return null;
}

export type PrefetchResult = {
  total: number;
  cached: number;
  skipped: number;
  failed: number;
  aborted: boolean;
  durationMs: number;
  error?: string;
};

/** Bulk-download every product image into the on-disk cache. */
export async function prefetchAllImages(): Promise<PrefetchResult> {
  const started = Date.now();
  const products = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  const urls = products.map((p) => p.imageUrl as string);
  const res: PrefetchResult = {
    total: urls.length,
    cached: 0,
    skipped: 0,
    failed: 0,
    aborted: false,
    durationMs: 0,
  };
  if (urls.length === 0) {
    res.durationMs = Date.now() - started;
    return res;
  }

  // Health gate: probe a handful; if none load, 1С is down — bail fast.
  let probeOk = false;
  for (const u of urls.slice(0, 5)) {
    const img = await fetchImageFromOneC(u, { retries: 0, timeoutMs: 12000 });
    if (img) {
      probeOk = true;
      const k = safeKey(u);
      if (k) await writeCached(k, img.buf);
      res.cached++;
      break;
    }
  }
  if (!probeOk) {
    res.aborted = true;
    res.error =
      "1С не отдаёт изображения (502/таймаут). Повторите, когда сервер 1С будет доступен.";
    res.durationMs = Date.now() - started;
    return res;
  }

  // Main pass: bounded concurrency + a circuit breaker if 1С drops again.
  const CONCURRENCY = 8;
  let idx = 0;
  let consecutiveFail = 0;
  let stop = false;

  async function worker() {
    while (!stop && idx < urls.length) {
      const u = urls[idx++];
      const k = safeKey(u);
      if (k && (await readCached(k))) {
        res.skipped++;
        continue;
      }
      const img = await fetchImageFromOneC(u, { retries: 1, timeoutMs: 12000 });
      if (img) {
        if (k) await writeCached(k, img.buf);
        res.cached++;
        consecutiveFail = 0;
      } else {
        res.failed++;
        consecutiveFail++;
        if (consecutiveFail > 60) {
          stop = true;
          res.aborted = true;
          res.error = "1С перестал отвечать во время загрузки — операция прервана.";
        }
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  res.durationMs = Date.now() - started;
  return res;
}
