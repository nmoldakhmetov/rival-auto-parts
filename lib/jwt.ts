import { SignJWT, jwtVerify } from "jose";

// Edge-safe session helpers (used by both middleware and route handlers).
// No Node-only APIs here so this module can run in the Edge runtime.

export type Role = "ADMIN" | "MANAGER" | "CLIENT";

export type SessionPayload = {
  sub: string; // user id
  role: Role;
  login: string;
  fullName: string;
};

export const SESSION_COOKIE = "rival_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me"
  );
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
