import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/jwt";
import { canAccessAdminPath, isStaff, landingSection } from "@/lib/permissions";

// Paths reachable without a session.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api/sync is guarded by its own X-Sync-Token header (called by 1С / cron).
  if (pathname.startsWith("/api/sync")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  // Already authenticated and visiting /login → go home.
  if (session && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // No session.
  if (!session) {
    if (isPublic(pathname)) return NextResponse.next();
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // Admin area: per-role, per-section access (see lib/permissions.ts).
  const adminArea =
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (adminArea && !canAccessAdminPath(session.role, pathname)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const url = req.nextUrl.clone();
    url.search = "";
    // Staff who hit a forbidden section → land on a section they DO have;
    // clients → home.
    if (isStaff(session.role)) {
      const sec = landingSection(session.role);
      url.pathname = sec === "overview" ? "/admin" : `/admin/${sec}`;
    } else {
      url.pathname = "/";
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static image assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
