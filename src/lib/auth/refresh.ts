import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { refreshTokens, users } from "@/db/schema";
import {
  REFRESH_REUSE_GRACE_MS,
  REFRESH_TTL_PERSISTENT_SECONDS,
  REFRESH_TTL_SESSION_SECONDS,
} from "./config";
import { signAccessToken } from "./jwt";

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
const newRaw = () => randomBytes(32).toString("base64url");

type Meta = { userAgent?: string | null; ip?: string | null };

export type IssuedSession = {
  accessToken: string;
  refreshToken: string | null; // null => keep the cookie the browser already has
  persistent: boolean;
  userId: string;
};

function expiry(persistent: boolean) {
  return new Date(Date.now() + 1000 * (persistent ? REFRESH_TTL_PERSISTENT_SECONDS : REFRESH_TTL_SESSION_SECONDS));
}

/** Starts a brand-new token family (sign in). */
export async function createSession(userId: string, sessionVersion: number, persistent: boolean, meta: Meta): Promise<IssuedSession> {
  const familyId = crypto.randomUUID();
  const raw = newRaw();
  await db.insert(refreshTokens).values({
    userId,
    familyId,
    tokenHash: hashToken(raw),
    persistent,
    expiresAt: expiry(persistent),
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip ?? null,
  });
  return {
    accessToken: await signAccessToken({ sub: userId, sv: sessionVersion, fid: familyId }),
    refreshToken: raw,
    persistent,
    userId,
  };
}

/**
 * Rotates a refresh token. Each token is single use; presenting an already-used
 * token outside a short grace window is treated as theft and kills the whole family.
 */
export async function rotateSession(raw: string, meta: Meta): Promise<IssuedSession | null> {
  if (!raw || raw.length > 200) return null;
  const tokenHash = hashToken(raw);
  const now = new Date();

  // Atomic claim: only one request can mark this token used.
  const [claimed] = await db
    .update(refreshTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.usedAt),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .returning();

  if (claimed) return issueSuccessor(claimed, meta);

  const [existing] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  if (!existing || existing.revokedAt || existing.expiresAt <= now) return null;

  if (existing.usedAt && now.getTime() - existing.usedAt.getTime() <= REFRESH_REUSE_GRACE_MS) {
    // A parallel request already rotated this token. It gets its own successor in the same family:
    // if the browser drops the other response (a cancelled navigation or prefetch), it must still end
    // up holding a live refresh token, or its next refresh would look like theft and sign it out.
    return issueSuccessor(existing, meta);
  }

  // Reuse of a rotated token: someone else holds a copy. Revoke the whole family.
  await revokeFamily(existing.familyId);
  console.warn(`[auth] refresh token reuse detected; family ${existing.familyId} revoked`);
  return null;
}

/** New single-use refresh token in the same family, plus an access token. */
async function issueSuccessor(prev: typeof refreshTokens.$inferSelect, meta: Meta): Promise<IssuedSession | null> {
  const [user] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, prev.userId));
  if (!user) return null;
  const next = newRaw();
  await db.insert(refreshTokens).values({
    userId: prev.userId,
    familyId: prev.familyId,
    tokenHash: hashToken(next),
    persistent: prev.persistent,
    expiresAt: expiry(prev.persistent),
    userAgent: meta.userAgent?.slice(0, 300) ?? prev.userAgent,
    ip: meta.ip ?? prev.ip,
  });
  return {
    accessToken: await signAccessToken({ sub: prev.userId, sv: user.sv, fid: prev.familyId }),
    refreshToken: next,
    persistent: prev.persistent,
    userId: prev.userId,
  };
}

export async function revokeFamily(familyId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllForUser(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function familyIsActive(familyId: string) {
  const [row] = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}
