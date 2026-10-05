import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from "@/lib/auth/config";
import { OAUTH_COOKIE, finishGoogle } from "@/lib/auth/google";
import { createSession } from "@/lib/auth/refresh";
import { ensureCategories } from "@/lib/budget";
import { googleEnabled } from "@/lib/env";
import { enforce, RateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const fail = (code = "google") => {
    const r = NextResponse.redirect(new URL(`/signin?error=${code}`, req.url));
    r.cookies.delete(OAUTH_COOKIE);
    return r;
  };
  if (!googleEnabled()) return fail();
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    await enforce(`google:ip:${ip}`, 30, 15 * 60);
  } catch (e) {
    if (e instanceof RateLimitError) return fail();
    throw e;
  }

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  let profile: Awaited<ReturnType<typeof finishGoogle>> = null;
  try {
    profile = code ? await finishGoogle(req.nextUrl.origin, code, state, req.cookies.get(OAUTH_COOKIE)?.value) : null;
  } catch (e) {
    console.error("[google] callback failed", e instanceof Error ? e.message : e);
  }
  if (!profile) return fail();

  let [user] = await db.select().from(users).where(eq(users.googleSub, profile.sub));
  if (!user) {
    // Never auto-link to an existing account by email: that account may have been registered by someone else.
    const [byEmail] = await db.select({ id: users.id }).from(users).where(eq(users.email, profile.email));
    if (byEmail) return fail("google_link");
    [user] = await db
      .insert(users)
      .values({ firstName: profile.firstName, lastName: profile.lastName, email: profile.email, googleSub: profile.sub })
      .returning();
    await ensureCategories(user.id);
  }

  const s = await createSession(user.id, user.sessionVersion, true, { ip, userAgent: req.headers.get("user-agent") });
  const res = NextResponse.redirect(new URL(user.onboardedAt ? "/home" : "/setup/income", req.url));
  res.cookies.delete(OAUTH_COOKIE);
  res.cookies.set(ACCESS_COOKIE, s.accessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, s.refreshToken!, refreshCookieOptions(true));
  return res;
}
