import "server-only";
import { cookies } from "next/headers";
import { FLASH_COOKIE, encodeFlash } from "./flash-name";

/** Queues a toast for the next page, for actions that end in a redirect. */
export async function flash(message: string, tone: "ok" | "error" = "ok") {
  (await cookies()).set(FLASH_COOKIE, encodeFlash(message, tone), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30,
  });
}
