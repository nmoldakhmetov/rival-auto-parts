import { SignJWT, jwtVerify } from "jose";

// Edge-safe session helpers (used by both middleware and route handlers).
// No Node-only APIs here so this module can run in the Edge runtime.

export type Role = "ADMIN" | "RA" | "MANAGER" | "ACCOUNTANT" | "CLIENT";

export type SessionPayload = {
  sub: string; // user id
  role: Role;
  login: string;
  fullName: string;
};

export const SESSION_COOKIE = "rival_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Session-signing key. This value is the ONLY thing standing between the
// portal and a forged admin cookie, so a missing AUTH_SECRET must never
// silently fall back to a constant that lives in the repository — anyone
// could then mint themselves a `role: ADMIN` session. In production we refuse
// to sign or verify anything until a real secret is configured.
const DEV_FALLBACK = "dev-insecure-secret-change-me";
const WEAK_LENGTH = 32;

let warnedWeak = false;

function secret(): Uint8Array {
  const configured = process.env.AUTH_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!configured || configured === DEV_FALLBACK) {
    if (isProd) {
      throw new Error(
        "AUTH_SECRET не задан. Этим ключом подписываются сессии: без него " +
          "любой может подделать cookie администратора. Задайте переменную " +
          "окружения AUTH_SECRET (случайная строка от 32 символов) и " +
          "перезапустите приложение."
      );
    }
    return new TextEncoder().encode(DEV_FALLBACK);
  }

  if (configured.length < WEAK_LENGTH && !warnedWeak) {
    warnedWeak = true;
    console.warn(
      `⚠ AUTH_SECRET короче ${WEAK_LENGTH} символов — замените на более длинный.`
    );
  }
  return new TextEncoder().encode(configured);
}

export async function signSession(
  payload: SessionPayload,
  maxAgeSec = SESSION_MAX_AGE
): Promise<string> {
  return new SignJWT({
    role: payload.role,
    login: payload.login,
    fullName: payload.fullName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSec}s`)
    .sign(secret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      sub: String(payload.sub),
      role: payload.role as Role,
      login: String(payload.login ?? ""),
      fullName: String(payload.fullName ?? ""),
    };
  } catch {
    return null;
  }
}
