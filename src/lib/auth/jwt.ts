import { SignJWT, jwtVerify, errors } from "jose";
import { ACCESS_TTL_SECONDS, JWT_AUDIENCE, JWT_ISSUER } from "./config";

export type AccessClaims = { sub: string; sv: number; fid: string };

function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 43) throw new Error("JWT_SECRET must be set to at least 32 random bytes");
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(c: AccessClaims) {
  return new SignJWT({ sv: c.sv, fid: c.fid })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(c.sub)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setJti(crypto.randomUUID())
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(key());
}

/** Returns claims, or null if missing/invalid/expired. Algorithm is pinned to HS256. */
export async function verifyAccessToken(token: string | undefined): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: 5,
    });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number" || typeof payload.fid !== "string") return null;
    return { sub: payload.sub, sv: payload.sv, fid: payload.fid };
  } catch (e) {
    if (e instanceof errors.JOSEError) return null;
    throw e;
  }
}
