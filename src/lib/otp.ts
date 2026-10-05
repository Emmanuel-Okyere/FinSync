import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { env } from "@/lib/env";
import { enforce } from "@/lib/rate-limit";
import { sendSms } from "@/lib/sms/giant";

export type OtpPurpose = "verify_phone" | "login" | "reset_password" | "change_phone";

const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

function hash(phone: string, purpose: string, code: string) {
  const secret = env().OTP_SECRET;
  if (!secret) throw new Error("OTP_SECRET must be set when OTP_ENABLED=true");
  return createHmac("sha256", secret).update(`${purpose}:${phone}:${code}`).digest("hex");
}

const copy: Record<OtpPurpose, string> = {
  verify_phone: "to confirm your phone number",
  login: "to sign in",
  reset_password: "to reset your password",
  change_phone: "to confirm your new number",
};

/** Sends a 6-digit code. Rate limited per phone and per IP to stop SMS abuse. */
export async function sendOtp(phone: string, purpose: OtpPurpose, ip: string) {
  await enforce(`otp:phone:${phone}`, 5, 60 * 60);
  await enforce(`otp:cooldown:${phone}:${purpose}`, 1, 45);
  await enforce(`otp:ip:${ip}`, 20, 60 * 60);

  // Invalidate any earlier live codes for this purpose.
  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.phone, phone), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)));

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(otpCodes).values({
    phone,
    purpose,
    codeHash: hash(phone, purpose, code),
    expiresAt: new Date(Date.now() + TTL_MIN * 60_000),
  });
  const r = await sendSms(phone, `${code} is your FinSync code ${copy[purpose]}. It expires in ${TTL_MIN} minutes. Never share it.`);
  if (!r.ok) throw new Error("We couldn't send the SMS. Try again shortly.");
}

/** Returns true once for a valid code; burns attempts on failure. */
export async function verifyOtp(phone: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.phone, phone),
        eq(otpCodes.purpose, purpose),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;

  const a = Buffer.from(row.codeHash, "hex");
  const b = Buffer.from(hash(phone, purpose, code), "hex");
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    await db.update(otpCodes).set({ attempts: sql`${otpCodes.attempts} + 1` }).where(eq(otpCodes.id, row.id));
    return false;
  }
  // Single use: only the first concurrent verifier wins.
  const consumed = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  return consumed.length === 1;
}
