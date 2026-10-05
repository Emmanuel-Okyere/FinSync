import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP 2024 baseline for Argon2id.
const opts = { algorithm: 2 /* Argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, opts);

let dummy: Promise<string> | undefined;

/** Constant-ish time: verifies against a dummy hash when the user doesn't exist. */
export async function verifyPassword(stored: string | null | undefined, pw: string) {
  if (!stored) {
    dummy ??= hash("not-a-real-password-for-timing", opts);
    await verify(await dummy, pw).catch(() => false);
    return false;
  }
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
}

const COMMON = new Set([
  "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "iloveyou12",
  "abcdefghij", "0123456789", "1111111111", "letmein123", "welcome123", "football12", "admin12345",
]);

export function passwordProblem(pw: string, ...personal: string[]): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 128) return "Use at most 128 characters.";
  if (/^(.)\1+$/.test(pw)) return "Avoid repeating one character.";
  if (COMMON.has(pw.toLowerCase())) return "That password is too common.";
  const lower = pw.toLowerCase();
  for (const p of personal) if (p && p.length >= 4 && lower.includes(p.toLowerCase())) return "Don't use your name or number in the password.";
  return null;
}
