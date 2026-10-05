const prod = process.env.NODE_ENV === "production";

// __Host- cookies must be Secure, Path=/ and have no Domain: they can't be set by subdomains.
export const ACCESS_COOKIE = prod ? "__Host-fs_at" : "fs_at";
export const REFRESH_COOKIE = prod ? "__Host-fs_rt" : "fs_rt";

export const ACCESS_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TTL_PERSISTENT_SECONDS = 30 * 24 * 60 * 60; // 30 days ("keep me signed in")
export const REFRESH_TTL_SESSION_SECONDS = 12 * 60 * 60; // 12 hours, browser-session cookie
export const REFRESH_REUSE_GRACE_MS = 20_000; // parallel requests racing the same rotation

export const JWT_ISSUER = "finsync";
export const JWT_AUDIENCE = "finsync-web";

export const baseCookie = {
  httpOnly: true,
  secure: prod,
  sameSite: "lax" as const,
  path: "/",
};

export function accessCookieOptions() {
  return { ...baseCookie, maxAge: ACCESS_TTL_SECONDS };
}

export function refreshCookieOptions(persistent: boolean) {
  return persistent ? { ...baseCookie, maxAge: REFRESH_TTL_PERSISTENT_SECONDS } : { ...baseCookie };
}
