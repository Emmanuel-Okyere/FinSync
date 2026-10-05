"use server";

import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pendingSignups, users } from "@/db/schema";
import { FormState, UserError, formObject, run } from "@/lib/action";
import { ensureCategories } from "@/lib/budget";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { clearPending, clearResetGrant, getPending, getResetGrant, safeNext, setPending, setResetGrant } from "@/lib/auth/pending";
import { revokeAllForUser } from "@/lib/auth/refresh";
import { clientMeta, endSession, startSession } from "@/lib/auth/session";
import { sendOtp, verifyOtp } from "@/lib/otp";
import { looksLikeEmail, normalizePhone } from "@/lib/phone";
import { enforce } from "@/lib/rate-limit";
import { phoneAllowedForSms } from "@/lib/sms/giant";
import { otpEnabled } from "@/lib/env";

function requireOtp() {
  if (!otpEnabled()) throw new UserError("SMS codes are switched off. Sign in with your password.");
}

const zPhone = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const p = normalizePhone(s);
    if (!p) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number, like 024 555 0192" });
      return z.NEVER;
    }
    return p;
  });

function assertSmsCountry(phone: string) {
  if (!phoneAllowedForSms(phone)) throw new UserError("FinSync is only available for Ghana numbers right now.", "phone");
}

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ip } = await clientMeta();
    await enforce(`signup:ip:${ip}`, 10, 60 * 60);
    const d = z
      .object({
        firstName: z.string().trim().min(1, "Enter your first name").max(60),
        lastName: z.string().trim().max(60).default(""),
        phone: zPhone,
        password: z.string().max(128, "Use at most 128 characters"),
        terms: z.literal("on", { message: "Please agree to the terms to continue" }),
      })
      .parse(formObject(fd));
    assertSmsCountry(d.phone);
    const problem = passwordProblem(d.password, d.firstName, d.lastName, d.phone.slice(-7));
    if (problem) throw new UserError(problem, "password");

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, d.phone));
    if (existing) throw new UserError("This number already has an account. Sign in instead.", "phone");

    if (!otpEnabled()) {
      // SMS verification is switched off: create the account and sign in straight away.
      const [created] = await db
        .insert(users)
        .values({ firstName: d.firstName, lastName: d.lastName, phone: d.phone, passwordHash: await hashPassword(d.password) })
        .onConflictDoNothing()
        .returning();
      if (!created) throw new UserError("This number already has an account. Sign in instead.", "phone");
      await ensureCategories(created.id);
      await startSession(created, true);
      redirect("/setup/income");
    }

    const [pending] = await db
      .insert(pendingSignups)
      .values({
        phone: d.phone,
        firstName: d.firstName,
        lastName: d.lastName,
        passwordHash: await hashPassword(d.password),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      })
      .returning({ id: pendingSignups.id });
    await sendOtp(d.phone, "verify_phone", ip);
    await setPending({ phone: d.phone, purpose: "verify_phone", remember: true, signupId: pending.id });
    redirect("/verify");
  });
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const { ip } = await clientMeta();
    const d = z
      .object({
        identifier: z.string().trim().min(3, "Enter your phone number or email").max(254),
        password: z.string().min(1, "Enter your password").max(128),
        remember: z.string().optional(),
        next: z.string().optional(),
      })
      .parse(formObject(fd));

    const isEmail = looksLikeEmail(d.identifier);
    const key = isEmail ? d.identifier.toLowerCase() : normalizePhone(d.identifier);
    await enforce(`signin:ip:${ip}`, 30, 15 * 60);
    if (key) await enforce(`signin:id:${key}`, 8, 15 * 60);

    const [user] = key
      ? await db.select().from(users).where(isEmail ? eq(users.email, key) : eq(users.phone, key))
      : [];
    const ok = await verifyPassword(user?.passwordHash, d.password);
    if (!user || !ok) throw new UserError("That phone/email and password don't match.");

    await startSession(user, d.remember === "on");
    redirect(user.onboardedAt ? safeNext(d.next) : "/setup/income");
  });
}

/** "Use a one-time code" sign in. Same response whether or not the number has an account. */
export async function requestLoginCode(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    requireOtp();
    const { ip } = await clientMeta();
    const { phone, next } = z.object({ phone: zPhone, next: z.string().optional() }).parse(formObject(fd));
    assertSmsCountry(phone);
    await enforce(`logincode:ip:${ip}`, 10, 60 * 60);
    const [user] = await db.select({ v: users.phoneVerifiedAt }).from(users).where(eq(users.phone, phone));
    if (user?.v) await sendOtp(phone, "login", ip);
    await setPending({ phone, purpose: "login", remember: false, next: safeNext(next) });
    redirect("/verify");
  });
}

export async function requestReset(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    requireOtp();
    const { ip } = await clientMeta();
    const { phone } = z.object({ phone: zPhone }).parse(formObject(fd));
    assertSmsCountry(phone);
    await enforce(`reset:ip:${ip}`, 10, 60 * 60);
    const [user] = await db.select({ v: users.phoneVerifiedAt }).from(users).where(eq(users.phone, phone));
    if (user?.v) await sendOtp(phone, "reset_password", ip);
    await setPending({ phone, purpose: "reset_password", remember: false });
    redirect("/verify");
  });
}

export async function resendCode(): Promise<FormState> {
  return run(
    async () => {
      requireOtp();
      const p = await getPending();
      if (!p) throw new UserError("Start again: your code request expired.");
      const { ip } = await clientMeta();
      const [user] = await db.select({ v: users.phoneVerifiedAt }).from(users).where(eq(users.phone, p.phone));
      const shouldSend = p.purpose === "verify_phone" ? !user : Boolean(user?.v);
      if (shouldSend) await sendOtp(p.phone, p.purpose, ip);
      return "A new code is on its way.";
    },
    { refresh: false },
  );
}

export async function verifyCode(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    requireOtp();
    const p = await getPending();
    if (!p) throw new UserError("Your code expired. Start again.");
    const code = String(fd.get("code") ?? "").replace(/\D/g, "");
    await enforce(`verify:${p.phone}`, 10, 15 * 60);
    const valid = await verifyOtp(p.phone, p.purpose, code);
    if (!valid) throw new UserError("That code is wrong or has expired.", "code");

    await clearPending();

    if (p.purpose === "verify_phone") {
      const [signup] = p.signupId
        ? await db
            .select()
            .from(pendingSignups)
            .where(and(eq(pendingSignups.id, p.signupId), eq(pendingSignups.phone, p.phone), gt(pendingSignups.expiresAt, new Date())))
        : [];
      if (!signup) throw new UserError("Your sign-up expired. Please start again.");
      const [created] = await db
        .insert(users)
        .values({
          firstName: signup.firstName,
          lastName: signup.lastName,
          phone: signup.phone,
          phoneVerifiedAt: new Date(),
          passwordHash: signup.passwordHash,
        })
        .onConflictDoNothing()
        .returning();
      await db.delete(pendingSignups).where(eq(pendingSignups.phone, p.phone));
      if (!created) throw new UserError("This number already has an account. Sign in instead.");
      await ensureCategories(created.id);
      await startSession(created, p.remember);
      redirect("/setup/income");
    }

    const [user] = await db.select().from(users).where(eq(users.phone, p.phone));
    if (!user) throw new UserError("That code is wrong or has expired.", "code");

    if (p.purpose === "login") {
      await startSession(user, false);
      redirect(user.onboardedAt ? safeNext(p.next) : "/setup/income");
    }
    await setResetGrant(user.id, user.sessionVersion);
    redirect("/forgot/new");
  });
}

export async function setNewPassword(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    requireOtp();
    const g = await getResetGrant();
    if (!g) throw new UserError("This reset link expired. Request a new code.");
    const password = String(fd.get("password") ?? "");
    const [user] = await db.select().from(users).where(eq(users.id, g.userId));
    if (!user || user.sessionVersion !== g.sv) throw new UserError("This reset link expired. Request a new code.");
    const problem = passwordProblem(password, user.firstName, user.lastName);
    if (problem) throw new UserError(problem, "password");
    const passwordHash = await hashPassword(password);
    // Bumping the version kills every signed-in device and makes this grant single use.
    const [updated] = await db
      .update(users)
      .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    await revokeAllForUser(user.id);
    await clearResetGrant();
    await startSession(updated, false);
    redirect("/home");
  });
}

export async function signOut() {
  await endSession();
  redirect("/");
}
