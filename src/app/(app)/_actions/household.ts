"use server";

import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { householdInvites, householdMembers, householdSettlements, households, transactions } from "@/db/schema";
import { FormState, UserError, formObject, run, zMoney, zMoneyOpt, zText, zUuid } from "@/lib/action";
import { actionUser } from "@/lib/auth/session";
import { balances, membershipOf } from "@/lib/household";
import { normalizePhone } from "@/lib/phone";
import { enforce } from "@/lib/rate-limit";
import { phoneAllowedForSms, sendSms } from "@/lib/sms/giant";

export async function createHousehold(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z.object({ name: zText(60, "Name"), limit: zMoneyOpt("Monthly limit") }).parse(formObject(fd));
    if (await membershipOf(user.id)) throw new UserError("You're already in a household.");
    const [h] = await db.insert(households).values({ name: d.name, ownerId: user.id, monthlyLimitMinor: d.limit ?? 0 }).returning();
    await db.insert(householdMembers).values({ householdId: h.id, userId: user.id, role: "owner" });
    return "Household created";
  });
}

export async function updateHousehold(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const m = await membershipOf(user.id);
    if (!m || m.role !== "owner") throw new UserError("Only the owner can change this.");
    const d = z.object({ name: zText(60, "Name"), limit: zMoneyOpt("Monthly limit") }).parse(formObject(fd));
    await db.update(households).set({ name: d.name, monthlyLimitMinor: d.limit ?? 0 }).where(eq(households.id, m.householdId));
    return "Household settings saved";
  });
}

export async function inviteMember(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const m = await membershipOf(user.id);
    if (!m) throw new UserError("Create a household first.");
    const phone = normalizePhone(String(fd.get("phone") ?? ""));
    if (!phone) throw new UserError("Enter a valid phone number.", "phone");
    if (!phoneAllowedForSms(phone)) throw new UserError("Invites only work for Ghana numbers right now.", "phone");
    if (phone === user.phone) throw new UserError("That's your own number.", "phone");
    await enforce(`invite:${user.id}`, 10, 24 * 60 * 60);
    const [existing] = await db
      .select({ id: householdInvites.id })
      .from(householdInvites)
      .where(and(eq(householdInvites.householdId, m.householdId), eq(householdInvites.phone, phone), isNull(householdInvites.acceptedAt), gt(householdInvites.expiresAt, new Date())));
    if (!existing) {
      await db.insert(householdInvites).values({ householdId: m.householdId, phone, invitedBy: user.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) });
    }
    const base = process.env.APP_URL || "";
    // The SMS carries no secret: the invite is claimed by signing in with this (verified) number.
    await sendSms(phone, `${user.firstName} invited you to share the "${m.h.name.slice(0, 40)}" budget on FinSync. Sign in or sign up with this number to join${base ? `: ${base}/household` : "."}`);
    return "Invite sent by SMS";
  });
}

export async function acceptInvite(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const id = zUuid.parse(fd.get("id"));
    if (!user.phone || !user.phoneVerifiedAt) throw new UserError("Verify your phone number first.");
    if (await membershipOf(user.id)) throw new UserError("Leave your current household first.");
    const [inv] = await db
      .select()
      .from(householdInvites)
      .where(and(eq(householdInvites.id, id), eq(householdInvites.phone, user.phone), isNull(householdInvites.acceptedAt), gt(householdInvites.expiresAt, new Date())));
    if (!inv) throw new UserError("That invite has expired.");
    await db.insert(householdMembers).values({ householdId: inv.householdId, userId: user.id, role: "member" });
    await db.update(householdInvites).set({ acceptedAt: new Date() }).where(eq(householdInvites.id, inv.id));
    return "You joined the household";
  });
}

export async function leaveHousehold(): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const m = await membershipOf(user.id);
    if (!m) return "Not in a household";
    const { net } = await balances(m.householdId);
    if (Math.abs(net.get(user.id) ?? 0) >= 100) throw new UserError("Settle up before you leave.");
    await db.delete(householdMembers).where(and(eq(householdMembers.householdId, m.householdId), eq(householdMembers.userId, user.id)));
    // Your shared entries become personal again.
    await db.update(transactions).set({ householdId: null }).where(and(eq(transactions.userId, user.id), eq(transactions.householdId, m.householdId)));
    const [next] = await db.select().from(householdMembers).where(eq(householdMembers.householdId, m.householdId)).orderBy(asc(householdMembers.joinedAt)).limit(1);
    if (!next) await db.delete(households).where(eq(households.id, m.householdId));
    else if (m.role === "owner") {
      await db.update(householdMembers).set({ role: "owner" }).where(and(eq(householdMembers.householdId, m.householdId), eq(householdMembers.userId, next.userId)));
      await db.update(households).set({ ownerId: next.userId }).where(eq(households.id, m.householdId));
    }
    return "You left the household";
  });
}

export async function settleUp(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const m = await membershipOf(user.id);
    if (!m) throw new UserError("Not in a household.");
    const d = z.object({ from: zUuid, to: zUuid, amount: zMoney() }).parse(formObject(fd));
    if (d.from === d.to || (d.from !== user.id && d.to !== user.id)) throw new UserError("You can only settle your own balance.");
    const other = d.from === user.id ? d.to : d.from;
    const [om] = await db.select().from(householdMembers).where(and(eq(householdMembers.householdId, m.householdId), eq(householdMembers.userId, other)));
    if (!om) throw new UserError("That person isn't in your household.");
    if (d.amount <= 0) throw new UserError("Enter an amount above zero.");
    await db.insert(householdSettlements).values({ householdId: m.householdId, fromUserId: d.from, toUserId: d.to, amountMinor: d.amount });
    return "Balance settled";
  });
}

export async function shareEntry(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const m = await membershipOf(user.id);
    if (!m) throw new UserError("Not in a household.");
    const id = zUuid.parse(fd.get("id"));
    const shared = fd.get("shared") === "on";
    await db
      .update(transactions)
      .set({ householdId: shared ? m.householdId : null })
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id), eq(transactions.kind, "expense")));
    return shared ? "Shared with your household" : "No longer shared";
  });
}
