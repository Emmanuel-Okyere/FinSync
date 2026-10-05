import "server-only";
import { env, isProd } from "@/lib/env";

const BASE_URL = "https://api.giantsms.com/api/v1";

function authToken() {
  const e = env();
  if (e.GIANTSMS_TOKEN) return e.GIANTSMS_TOKEN;
  if (e.GIANTSMS_USERNAME && e.GIANTSMS_SECRET) {
    return Buffer.from(`${e.GIANTSMS_USERNAME}:${e.GIANTSMS_SECRET}`).toString("base64");
  }
  return null;
}

export function smsConfigured() {
  return authToken() !== null;
}

/** GIANT SMS expects 233XXXXXXXXX (no plus). */
function toMsisdn(e164: string) {
  return e164.replace(/^\+/, "");
}

export function phoneAllowedForSms(e164: string) {
  // Blocks SMS-pumping fraud: only send to countries you actually serve.
  return env()
    .SMS_ALLOWED_PREFIXES.split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .some((p) => e164.startsWith(p));
}

export async function sendSms(toE164: string, message: string): Promise<{ ok: boolean; id?: string }> {
  if (!phoneAllowedForSms(toE164)) throw new Error("SMS is not available for this country.");
  const token = authToken();
  if (!token) {
    if (isProd) throw new Error("SMS provider is not configured.");
    // Development only: no credentials, so print instead of sending.
    console.info(`[sms:dev] to ${toE164}: ${message}`);
    return { ok: true, id: "dev" };
  }

  const res = await fetch(`${BASE_URL}/send`, {
    method: "POST",
    headers: { Authorization: `Basic ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ from: env().GIANTSMS_SENDER_ID, to: toMsisdn(toE164), msg: message }),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  let body: { status?: boolean; message?: string; data?: { message_id?: string } } = {};
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok || body.status === false) {
    // Never log message bodies (they contain one-time codes).
    console.error(`[sms] GIANT SMS send failed: http ${res.status} ${body.message ?? ""}`.trim());
    return { ok: false };
  }
  return { ok: true, id: body.data?.message_id };
}
