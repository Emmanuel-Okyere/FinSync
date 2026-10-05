import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, accessCookieOptions, refreshCookieOptions } from "@/lib/auth/config";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { rotateSession } from "@/lib/auth/refresh";

const PUBLIC_PREFIXES = ["/signin", "/signup", "/forgot", "/verify", "/terms", "/privacy", "/api/auth/", "/api/cron/"];

function isPublic(path: string) {
  return path === "/" || PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

function securityHeaders(res: NextResponse, csp: string) {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const dev = process.env.NODE_ENV !== "production";

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://lh3.googleusercontent.com",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let claims = await verifyAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);
  let issued: Awaited<ReturnType<typeof rotateSession>> = null;
  let clearCookies = false;

  const rt = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!claims && rt) {
    issued = await rotateSession(rt, {
      ip: request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent"),
    });
    if (issued) {
      claims = await verifyAccessToken(issued.accessToken);
      // Let this same request render with the fresh tokens.
      const jar = request.cookies;
      jar.set(ACCESS_COOKIE, issued.accessToken);
      if (issued.refreshToken) jar.set(REFRESH_COOKIE, issued.refreshToken);
      requestHeaders.set(
        "cookie",
        jar
          .getAll()
          .map((c) => `${c.name}=${c.value}`)
          .join("; "),
      );
    } else {
      clearCookies = true;
    }
  }

  let res: NextResponse;
  const isApi = pathname.startsWith("/api/");
  if (!claims && !isPublic(pathname) && !isApi) {
    const to = new URL("/signin", request.url);
    if (pathname !== "/home") to.searchParams.set("next", pathname + search);
    res = NextResponse.redirect(to);
  } else {
    res = NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (issued) {
    res.cookies.set(ACCESS_COOKIE, issued.accessToken, accessCookieOptions());
    if (issued.refreshToken) res.cookies.set(REFRESH_COOKIE, issued.refreshToken, refreshCookieOptions(issued.persistent));
  } else if (clearCookies) {
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
  }
  res.headers.set("Cache-Control", "private, no-store");
  return securityHeaders(res, csp);
}

export const config = {
  // Static assets (icons, manifest) skip the proxy so the sign-in redirect never intercepts them.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|icons/|robots.txt).*)"],
};
