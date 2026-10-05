import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { refreshTokens, users } from "@/db/schema";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from "./config";
import { verifyAccessToken } from "./jwt";
import { createSession, familyIsActive, hashToken, revokeFamily } from "./refresh";

export type SessionUser = typeof users.$inferSelect;

export async function clientMeta() {
  const h = await headers();
  const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return { ip, userAgent: h.get("user-agent") };
}

/** Verifies the access token AND that the user/session still exist. Memoised per request. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const claims = await verifyAccessToken(jar.get(ACCESS_COOKIE)?.value);
  if (!claims) return null;
  const [[user], active] = await Promise.all([
    db.select().from(users).where(eq(users.id, claims.sub)).limit(1),
    familyIsActive(claims.fid),
  ]);
  if (!user || !active || user.sessionVersion !== claims.sv) return null;
  return user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/signin");
  return user;
}

/** For app pages: signed in AND finished setup. */
export async function requireOnboardedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.onboardedAt) redirect("/setup/income");
  return user;
}

/** Use inside server actions; throws instead of redirecting mid-mutation. */
export async function actionUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new Error("Your session has ended. Sign in again.");
  return user;
}

export async function startSession(user: Pick<SessionUser, "id" | "sessionVersion">, persistent: boolean) {
  const meta = await clientMeta();
  const s = await createSession(user.id, user.sessionVersion, persistent, meta);
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, s.accessToken, accessCookieOptions());
  jar.set(REFRESH_COOKIE, s.refreshToken!, refreshCookieOptions(persistent));
}

export async function endSession() {
  const jar = await cookies();
  const claims = await verifyAccessToken(jar.get(ACCESS_COOKIE)?.value);
  if (claims) await revokeFamily(claims.fid);
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (rt) {
    const [row] = await db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(rt)));
    if (row) await revokeFamily(row.familyId);
  }
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
