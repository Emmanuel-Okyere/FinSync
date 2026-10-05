import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { baseCookie, JWT_ISSUER } from "./config";

// Short-lived signed cookies carrying multi-step auth state (which phone is mid-verification,
// or a one-time "you may set a new password" grant). Signed, httpOnly, never trusted unsigned.
const prod = process.env.NODE_ENV === "production";
const PENDING = prod ? "__Host-fs_pending" : "fs_pending";
const RESET = prod ? "__Host-fs_reset" : "fs_reset";

const key = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export type Pending = { phone: string; purpose: "verify_phone" | "login" | "reset_password"; remember: boolean; next?: string; signupId?: string };

export async function setPending(p: Pending) {
  const t = await new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience("finsync-pending")
    .setExpirationTime("15m")
    .sign(key());
  (await cookies()).set(PENDING, t, { ...baseCookie, maxAge: 15 * 60 });
}

export async function getPending(): Promise<Pending | null> {
  const t = (await cookies()).get(PENDING)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key(), { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: "finsync-pending" });
    return payload as unknown as Pending;
  } catch {
    return null;
  }
}

export async function clearPending() {
  (await cookies()).delete(PENDING);
}

export async function setResetGrant(userId: string, sv: number) {
  const t = await new SignJWT({ sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setAudience("finsync-reset")
    .setExpirationTime("10m")
    .sign(key());
  (await cookies()).set(RESET, t, { ...baseCookie, maxAge: 10 * 60 });
}

export async function getResetGrant(): Promise<{ userId: string; sv: number } | null> {
  const t = (await cookies()).get(RESET)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key(), { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: "finsync-reset" });
    return { userId: payload.sub!, sv: payload.sv as number };
  } catch {
    return null;
  }
}

export async function clearResetGrant() {
  (await cookies()).delete(RESET);
}

/** Only same-site relative paths; blocks //evil.com and /\evil.com open redirects. */
export function safeNext(next: unknown, fallback = "/home") {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/api/")) return fallback;
  return next.slice(0, 300);
}
