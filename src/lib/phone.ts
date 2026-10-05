/**
 * Normalise a Ghana-style phone number to E.164 (+233XXXXXXXXX).
 * Accepts 024 555 0192, 0245550192, 233245550192, +233 24 555 0192.
 * Other countries must already be in +E.164 form.
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, "");
  if (/^0\d{9}$/.test(s)) return `+233${s.slice(1)}`;
  if (/^233\d{9}$/.test(s)) return `+${s}`;
  if (/^\+233\d{9}$/.test(s)) return s;
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  return null;
}

export function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** +233245550192 -> 024 555 0192 */
export function displayPhone(e164: string | null | undefined) {
  if (!e164) return "";
  const m = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

/** Mask for messages: 024 XXX 0192 */
export function maskPhone(e164: string) {
  const d = displayPhone(e164);
  return d.replace(/^(\d{3}) \d{3} /, "$1 XXX ");
}
