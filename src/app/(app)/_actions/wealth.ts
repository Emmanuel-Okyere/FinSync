"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  budgetLines,
  categories,
  debts,
  fixedExpenses,
  insurancePolicies,
  investmentEntries,
  investments,
  savingsAccounts,
  transactions,
} from "@/db/schema";
import { FormState, UserError, formObject, run, zBool, zDate, zDateOpt, zMoney, zMoneyOpt, zText, zTextOpt, zUuid } from "@/lib/action";
import { actionUser, type SessionUser } from "@/lib/auth/session";
import { ensureCategories, ensureMonth } from "@/lib/budget";
import { monthStart, todayISO } from "@/lib/dates";

async function categoryByName(user: SessionUser, name: string, bucket: string, icon: string, kind: "expense" | "income" = "expense") {
  await db.insert(categories).values({ userId: user.id, name, bucket, icon, kind }).onConflictDoNothing();
  const [c] = await db.select().from(categories).where(and(eq(categories.userId, user.id), eq(categories.name, name)));
  return c;
}

/* ----------------------------------------------------------------- Savings */

const accountSchema = z.object({
  name: zText(60, "Name"),
  kind: z.enum(["account", "tbill", "susu", "wallet", "other"]),
  balance: zMoney("Balance"),
  goal: zMoneyOpt("Goal"),
  maturesOn: zDateOpt,
  expectedReturn: zMoneyOpt("Expected return"),
  note: zTextOpt(120),
});

export async function saveAccount(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = accountSchema.parse(formObject(fd));
    const values = { name: d.name, kind: d.kind, balanceMinor: d.balance, goalMinor: d.goal ?? null, maturesOn: d.maturesOn ?? null, expectedReturnMinor: d.expectedReturn ?? null, note: d.note, updatedAt: new Date() };
    const id = fd.get("id") ? zUuid.parse(fd.get("id")) : null;
    if (id) {
      const r = await db.update(savingsAccounts).set(values).where(and(eq(savingsAccounts.id, id), eq(savingsAccounts.userId, user.id))).returning({ id: savingsAccounts.id });
      if (!r.length) throw new UserError("That account no longer exists.");
    } else {
      await db.insert(savingsAccounts).values({ ...values, userId: user.id });
    }
    return "Saved";
  });
}

export async function deleteAccount(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await db.delete(savingsAccounts).where(and(eq(savingsAccounts.id, zUuid.parse(fd.get("id"))), eq(savingsAccounts.userId, user.id)));
    return "Removed";
  });
}

/** Put money in or take it out; deposits can count as this month's saving. */
export async function moveSavings(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z.object({ id: zUuid, direction: z.enum(["in", "out"]), amount: zMoney(), log: zBool }).parse(formObject(fd));
    if (d.amount <= 0) throw new UserError("Enter an amount above zero.", "amount");
    const [acct] = await db.select().from(savingsAccounts).where(and(eq(savingsAccounts.id, d.id), eq(savingsAccounts.userId, user.id)));
    if (!acct) throw new UserError("That account no longer exists.");
    const delta = d.direction === "in" ? d.amount : -d.amount;
    if (acct.balanceMinor + delta < 0) throw new UserError("That's more than the balance.", "amount");
    await db.update(savingsAccounts).set({ balanceMinor: sql`${savingsAccounts.balanceMinor} + ${delta}`, updatedAt: new Date() }).where(eq(savingsAccounts.id, acct.id));
    if (d.direction === "in" && d.log) {
      const cat = await categoryByName(user, acct.name, "savings", "wallet");
      await db.insert(transactions).values({ userId: user.id, kind: "expense", amountMinor: d.amount, categoryId: cat.id, name: `Saved to ${acct.name}`, method: "bank", occurredOn: todayISO(), source: "manual" });
    }
    return d.direction === "in" ? `Added to ${acct.name}` : `Taken from ${acct.name}`;
  });
}

/* ------------------------------------------------------------------- Debts */

const debtSchema = z.object({
  direction: z.enum(["owe", "owed"]),
  name: zText(60, "Name"),
  lenderKind: z.enum(["bank", "shop", "personal", "other"]),
  principal: zMoney("Original amount"),
  balance: zMoney("Still owed"),
  apr: z
    .string()
    .optional()
    .transform((s) => (s ? Number(s) : 0))
    .pipe(z.number().min(0, "Rate can't be negative").max(500, "Check the rate")),
  monthly: zMoneyOpt("Monthly payment"),
  nextDueOn: zDateOpt,
  note: zTextOpt(120),
});

export async function saveDebt(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = debtSchema.parse(formObject(fd));
    if (d.balance > d.principal) throw new UserError("Still owed can't be more than the original amount.", "balance");
    const values = { direction: d.direction, name: d.name, lenderKind: d.lenderKind, principalMinor: d.principal, balanceMinor: d.balance, aprBp: Math.round(d.apr * 100), monthlyMinor: d.monthly ?? null, nextDueOn: d.nextDueOn ?? null, note: d.note };
    const id = fd.get("id") ? zUuid.parse(fd.get("id")) : null;
    if (id) {
      const r = await db.update(debts).set(values).where(and(eq(debts.id, id), eq(debts.userId, user.id))).returning({ id: debts.id });
      if (!r.length) throw new UserError("That debt no longer exists.");
    } else {
      await db.insert(debts).values({ ...values, userId: user.id });
    }
    return "Saved";
  });
}

export async function deleteDebt(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await db.delete(debts).where(and(eq(debts.id, zUuid.parse(fd.get("id"))), eq(debts.userId, user.id)));
    return "Removed";
  });
}

export async function recordDebtPayment(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z.object({ id: zUuid, amount: zMoney(), occurredOn: zDate, log: zBool }).parse(formObject(fd));
    const [debt] = await db.select().from(debts).where(and(eq(debts.id, d.id), eq(debts.userId, user.id)));
    if (!debt) throw new UserError("That debt no longer exists.");
    if (d.amount <= 0 || d.amount > debt.balanceMinor) throw new UserError(`Enter up to GH₵ ${(debt.balanceMinor / 100).toFixed(2)}.`, "amount");
    const updated = await db
      .update(debts)
      .set({ balanceMinor: sql`${debts.balanceMinor} - ${d.amount}` })
      .where(and(eq(debts.id, debt.id), sql`${debts.balanceMinor} >= ${d.amount}`))
      .returning({ id: debts.id });
    if (!updated.length) throw new UserError("Balance changed; try again.");
    if (d.log) {
      const cat =
        debt.direction === "owe"
          ? await categoryByName(user, "Debt repayment", "needs", "card")
          : await categoryByName(user, "Other income", "income", "download", "income");
      await db.insert(transactions).values({
        userId: user.id,
        kind: debt.direction === "owe" ? "expense" : "income",
        amountMinor: d.amount,
        categoryId: cat.id,
        name: debt.direction === "owe" ? `Paid ${debt.name}` : `${debt.name} paid back`,
        method: "momo",
        occurredOn: d.occurredOn,
        source: "manual",
      });
    }
    return "Payment recorded";
  });
}

/* ------------------------------------------------------------- Investments */

export async function saveInvestment(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z
      .object({ name: zText(60, "Name"), kind: z.enum(["pension", "fund", "deposit", "stocks", "other"]), detail: zTextOpt(120), value: zMoneyOpt("Current value"), invested: zMoneyOpt("Amount put in") })
      .parse(formObject(fd));
    const id = fd.get("id") ? zUuid.parse(fd.get("id")) : null;
    if (id) {
      const r = await db.update(investments).set({ name: d.name, kind: d.kind, detail: d.detail }).where(and(eq(investments.id, id), eq(investments.userId, user.id))).returning({ id: investments.id });
      if (!r.length) throw new UserError("That investment no longer exists.");
      return "Saved";
    }
    const [inv] = await db.insert(investments).values({ userId: user.id, name: d.name, kind: d.kind, detail: d.detail }).returning();
    const today = todayISO();
    const entries = [];
    if (d.invested) entries.push({ investmentId: inv.id, kind: "contribution", amountMinor: d.invested, occurredOn: today, note: "Opening amount" });
    if (d.value != null) entries.push({ investmentId: inv.id, kind: "valuation", amountMinor: d.value, occurredOn: today });
    if (entries.length) await db.insert(investmentEntries).values(entries);
    return "Investment added";
  });
}

async function ownInvestment(userId: string, id: string) {
  const [inv] = await db.select().from(investments).where(and(eq(investments.id, id), eq(investments.userId, userId)));
  if (!inv) throw new UserError("That investment no longer exists.");
  return inv;
}

export async function addContribution(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z.object({ id: zUuid, amount: zMoney(), occurredOn: zDate, units: z.string().optional(), log: zBool }).parse(formObject(fd));
    if (d.amount <= 0) throw new UserError("Enter an amount above zero.", "amount");
    const inv = await ownInvestment(user.id, d.id);
    const units = d.units && /^\d+(\.\d{1,4})?$/.test(d.units) ? d.units : null;
    await db.insert(investmentEntries).values({ investmentId: inv.id, kind: "contribution", amountMinor: d.amount, units, occurredOn: d.occurredOn, note: d.log ? "From Savings bucket" : null });
    if (d.log) {
      const cat = await categoryByName(user, "Investments", "savings", "trendUp");
      await db.insert(transactions).values({ userId: user.id, kind: "expense", amountMinor: d.amount, categoryId: cat.id, name: `Invested in ${inv.name}`, method: "bank", occurredOn: d.occurredOn, source: "manual" });
    }
    return "Contribution added";
  });
}

export async function updateValue(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z.object({ id: zUuid, value: zMoney("Value"), occurredOn: zDate, units: z.string().optional() }).parse(formObject(fd));
    const inv = await ownInvestment(user.id, d.id);
    const units = d.units && /^\d+(\.\d{1,4})?$/.test(d.units) ? d.units : null;
    await db.insert(investmentEntries).values({ investmentId: inv.id, kind: "valuation", amountMinor: d.value, units, occurredOn: d.occurredOn });
    return "Value updated";
  });
}

export async function deleteInvestment(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await db.delete(investments).where(and(eq(investments.id, zUuid.parse(fd.get("id"))), eq(investments.userId, user.id)));
    return "Removed";
  });
}

/* --------------------------------------------------------------- Insurance */

const policySchema = z.object({
  name: zText(60, "Name"),
  type: z.enum(["health", "car", "life", "funeral", "nhis", "home", "other"]),
  coverText: z.string().trim().max(120).default(""),
  premium: zMoney("Premium"),
  frequency: z.enum(["monthly", "yearly"]),
  renewsOn: zDateOpt,
  insurer: zTextOpt(80),
  policyNumber: zTextOpt(60),
  details: zTextOpt(200),
  excess: zMoneyOpt("Excess"),
});

export async function savePolicy(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await ensureCategories(user.id);
    const d = policySchema.parse(formObject(fd));
    const values = { name: d.name, type: d.type, coverText: d.coverText, premiumMinor: d.premium, frequency: d.frequency, renewsOn: d.renewsOn ?? null, insurer: d.insurer, policyNumber: d.policyNumber, details: d.details, excessMinor: d.excess ?? null };
    const id = fd.get("id") ? zUuid.parse(fd.get("id")) : null;
    let policyId = id;
    if (id) {
      const r = await db.update(insurancePolicies).set(values).where(and(eq(insurancePolicies.id, id), eq(insurancePolicies.userId, user.id))).returning({ id: insurancePolicies.id });
      if (!r.length) throw new UserError("That policy no longer exists.");
    } else {
      policyId = (await db.insert(insurancePolicies).values({ ...values, userId: user.id }).returning({ id: insurancePolicies.id }))[0].id;
    }
    // Monthly premiums become a fixed expense so every budget starts with them.
    await db.delete(fixedExpenses).where(and(eq(fixedExpenses.userId, user.id), eq(fixedExpenses.insurancePolicyId, policyId!)));
    if (d.frequency === "monthly") {
      const cat = await categoryByName(user, "Insurance", "needs", "shield");
      await db.insert(fixedExpenses).values({ userId: user.id, categoryId: cat.id, name: d.name, amountMinor: d.premium, dayOfMonth: 1, insurancePolicyId: policyId });
    }
    return "Policy saved";
  });
}

export async function deletePolicy(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const id = zUuid.parse(fd.get("id"));
    await db.delete(fixedExpenses).where(and(eq(fixedExpenses.userId, user.id), eq(fixedExpenses.insurancePolicyId, id)));
    await db.delete(insurancePolicies).where(and(eq(insurancePolicies.id, id), eq(insurancePolicies.userId, user.id)));
    return "Policy removed";
  });
}

/** Adds a yearly premium to the budget of the month it falls due. */
export async function addPremiumToBudget(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const [p] = await db.select().from(insurancePolicies).where(and(eq(insurancePolicies.id, zUuid.parse(fd.get("id"))), eq(insurancePolicies.userId, user.id)));
    if (!p) throw new UserError("That policy no longer exists.");
    const month = monthStart(p.renewsOn && p.renewsOn >= todayISO() ? p.renewsOn : todayISO());
    const m = await ensureMonth(user, month);
    const cat = await categoryByName(user, "Insurance", "needs", "shield");
    await db
      .insert(budgetLines)
      .values({ monthId: m.id, userId: user.id, categoryId: cat.id, plannedMinor: p.premiumMinor })
      .onConflictDoUpdate({ target: [budgetLines.monthId, budgetLines.categoryId], set: { plannedMinor: sql`${budgetLines.plannedMinor} + ${p.premiumMinor}` } });
    return `Added GH₵ ${Math.round(p.premiumMinor / 100)} to that month's Insurance line`;
  });
}
