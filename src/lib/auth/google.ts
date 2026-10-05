import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, createRemoteJWKSet, jwtVerify } from "jose";
import { JWT_ISSUER } from "./config";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const prod = process.env.NODE_ENV === "production";
export const OAUTH_COOKIE = prod ? "__Host-fs_oauth" : "fs_oauth";
const key = () => new TextEncoder().encode(process.env.JWT_SECRET!);

export function redirectUri(origin: string) {
  return `${process.env.APP_URL || origin}/api/auth/google/callback`;
}

export async function startGoogle(origin: string) {
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const cookie = await new SignJWT({ state, nonce, verifier })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience("finsync-oauth")
    .setExpirationTime("10m")
    .sign(key());
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie };
}

export async function finishGoogle(origin: string, code: string, state: string, cookie: string | undefined) {
  if (!cookie) return null;
  let saved: { state: string; nonce: string; verifier: string };
  try {
    const { payload } = await jwtVerify(cookie, key(), { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: "finsync-oauth" });
    saved = payload as unknown as typeof saved;
  } catch {
    return null;
  }
  if (!state || state !== saved.state) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return null;
  const { payload } = await jwtVerify(id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: process.env.GOOGLE_CLIENT_ID!,
  });
  if (payload.nonce !== saved.nonce || payload.email_verified !== true || typeof payload.email !== "string") return null;
  return {
    sub: String(payload.sub),
    email: payload.email.toLowerCase(),
    firstName: String(payload.given_name ?? payload.name ?? "Friend").slice(0, 60),
    lastName: String(payload.family_name ?? "").slice(0, 60),
  };
}
