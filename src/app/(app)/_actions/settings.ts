"use server";

import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, type UserSettings } from "@/db/schema";
import { FormState, UserError, formObject, run } from "@/lib/action";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { revokeAllForUser } from "@/lib/auth/refresh";
import { actionUser, clientMeta, endSession, startSession } from "@/lib/auth/session";
import { sendOtp, verifyOtp } from "@/lib/otp";
import { normalizePhone } from "@/lib/phone";
import { enforce } from "@/lib/rate-limit";
import { otpEnabled } from "@/lib/env";
import { phoneAllowedForSms } from "@/lib/sms/giant";

export async function updateProfile(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z
      .object({
        firstName: z.string().trim().min(1, "Enter your first name").max(60),
        lastName: z.string().trim().max(60).default(""),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .max(254)
          .optional()
          .transform((s) => (s ? s : null))
          .pipe(z.string().email("Enter a valid email").nullable()),
      })
      .parse(formObject(fd));
    if (d.email) {
      const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, d.email), ne(users.id, user.id)));
      if (taken) throw new UserError("That email is used by another account.", "email");
    }
    await db.update(users).set({ firstName: d.firstName, lastName: d.lastName, email: d.email, updatedAt: new Date() }).where(eq(users.id, user.id));
    return "Profile saved";
  });
}

const SETTING_KEYS = ["overBudgetAlerts", "billReminders", "dailySafeToSpend", "autoAddFixed"] as const;

export async function updateSettings(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const next: UserSettings = { ...user.settings };
    for (const k of SETTING_KEYS) next[k] = fd.get(k) === "on";
    const appearance = fd.get("appearance");
    if (appearance === "system" || appearance === "light" || appearance === "dark") next.appearance = appearance;
    await db.update(users).set({ settings: next, updatedAt: new Date() }).where(eq(users.id, user.id));
    return "Settings saved";
  });
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await enforce(`pwchange:${user.id}`, 5, 15 * 60);
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("password") ?? "");
    if (user.passwordHash && !(await verifyPassword(user.passwordHash, current))) throw new UserError("Your current password is wrong.", "current");
    const problem = passwordProblem(next, user.firstName, user.lastName);
    if (problem) throw new UserError(problem, "password");
    const [updated] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(next), sessionVersion: sql`${users.sessionVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    await revokeAllForUser(user.id);
    await startSession(updated, true);
    return "Password changed. Other devices were signed out.";
  });
}

export async function requestPhoneChange(_: FormState, fd: FormData): Promise<FormState> {
  return run(
    async () => {
      const user = await actionUser();
      const phone = normalizePhone(String(fd.get("phone") ?? ""));
      if (!phone) throw new UserError("Enter a valid phone number.", "phone");
      if (!phoneAllowedForSms(phone)) throw new UserError("Only Ghana numbers are supported right now.", "phone");
      if (user.passwordHash && !(await verifyPassword(user.passwordHash, String(fd.get("current") ?? "")))) throw new UserError("Your password is wrong.", "current");
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
      if (taken) throw new UserError("That number is used by another account.", "phone");
      const { ip } = await clientMeta();
      await sendOtp(phone, "change_phone", ip);
      return `Code sent to ${phone}`;
    },
    { refresh: false },
  );
}

/** Phone change confirmed by password only (used while SMS codes are switched off). */
export async function changePhone(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    if (otpEnabled()) throw new UserError("Confirm the new number with an SMS code.");
    await enforce(`phonechange:${user.id}`, 10, 15 * 60);
    const phone = normalizePhone(String(fd.get("phone") ?? ""));
    if (!phone) throw new UserError("Enter a valid phone number.", "phone");
    if (user.passwordHash && !(await verifyPassword(user.passwordHash, String(fd.get("current") ?? "")))) throw new UserError("Your password is wrong.", "current");
    const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), ne(users.id, user.id)));
    if (taken) throw new UserError("That number is used by another account.", "phone");
    // Not proven by SMS, so it stays unverified (no SMS alerts or household invites until verified).
    await db.update(users).set({ phone, phoneVerifiedAt: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    return "Phone number updated";
  });
}

export async function confirmPhoneChange(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const phone = normalizePhone(String(fd.get("phone") ?? ""));
    if (!phone) throw new UserError("Enter a valid phone number.", "phone");
    await enforce(`phonechange:${user.id}`, 10, 15 * 60);
    if (!(await verifyOtp(phone, "change_phone", String(fd.get("code") ?? "").trim()))) throw new UserError("That code is wrong or has expired.", "code");
    const r = await db
      .update(users)
      .set({ phone, phoneVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning({ id: users.id })
      .catch(() => []);
    if (!r.length) throw new UserError("That number is used by another account.", "phone");
    return "Phone number updated";
  });
}

export async function signOutEverywhere() {
  const user = await actionUser();
  await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, user.id));
  await revokeAllForUser(user.id);
  await endSession();
  redirect("/signin");
}

export async function deleteAccount(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await enforce(`delete:${user.id}`, 5, 15 * 60);
    if (String(fd.get("confirm") ?? "") !== "DELETE") throw new UserError('Type DELETE to confirm.', "confirm");
    if (user.passwordHash && !(await verifyPassword(user.passwordHash, String(fd.get("current") ?? "")))) throw new UserError("Your password is wrong.", "current");
    await endSession();
    // Cascades remove every row the user owns.
    await db.delete(users).where(eq(users.id, user.id));
    redirect("/");
  });
}
