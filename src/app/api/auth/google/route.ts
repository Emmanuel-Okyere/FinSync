import { NextResponse, type NextRequest } from "next/server";
import { baseCookie } from "@/lib/auth/config";
import { OAUTH_COOKIE, startGoogle } from "@/lib/auth/google";
import { googleEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/signin", req.url));
  const { url, cookie } = await startGoogle(req.nextUrl.origin);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, cookie, { ...baseCookie, maxAge: 600 });
  return res;
}
