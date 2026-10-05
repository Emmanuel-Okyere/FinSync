// Readable by the browser on purpose: it only carries a short status message to show as a toast.
export const FLASH_COOKIE = process.env.NODE_ENV === "production" ? "__Host-fs_flash" : "fs_flash";

/** Cookie value for a flash toast. Next.js URL-encodes cookie values itself, so this is plain JSON. */
export function encodeFlash(message: string, tone: "ok" | "error" = "ok") {
  return JSON.stringify({ m: message.slice(0, 200), t: tone });
}
