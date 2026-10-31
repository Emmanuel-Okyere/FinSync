"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, fixedExpenses, householdMembers, insurancePolicies, savingsAccounts, transactions } from "@/db/schema";
import { FormState, UserError, formObject, run, zDate, zMoney, zMoneyOpt, zTextOpt, zUuid } from "@/lib/action";
import { actionUser, type SessionUser } from "@/lib/auth/session";
import { syncCharge } from "@/lib/charges";
import { accountFee, adjustSaving, parsePaidWith, releaseSavings, saveAmount, syncAutoSave, type Account } from "@/lib/accounts";
import { cedis } from "@/lib/money";
import { dayOf } from "@/lib/dates";

const entrySchema = z.object({
  kind: z.enum(["income", "expense"]),
  amount: zMoney(),
  categoryId: zUuid,
  occurredOn: zDate,
  name: zTextOpt(80),
  note: zTextOpt(300),
  repeat: z.string().optional(),
  shared: z.string().optional(),
  policyId: z.string().optional(),
  // Transfer charge: the form sends feeUi=1 plus addFee/fee; without the UI the user's rule applies.
  feeUi: z.string().optional(),
  addFee: z.string().optional(),
  fee: zMoneyOpt("Charge"),
});

type Entry = z.infer<typeof entrySchema>;
type Paid = { method: string; account: Account | null };

/** The charge to record for an entry, or 0. */
function chargeFor(user: SessionUser, d: Pick<Entry, "kind" | "amount" | "feeUi" | "addFee" | "fee">, paid: Paid) {
  if (d.kind !== "expense") return 0;
  const rule = accountFee(user, d.amount, paid.method, paid.account);
  const fee = d.feeUi ? (d.addFee === "on" ? (d.fee ?? rule) : 0) : rule;
  if (fee > d.amount) throw new UserError("The charge can't be more than the amount.", "fee");
  if (fee > 100_000) throw new UserError("That charge looks too high. Check it.", "fee");
  return fee;
}

const parseSave = (s: string) => zMoney("Saving").parse(s);

/** Toast text for a saved expense with its extras. */
function extras(fee: number, saved: number, savedTo: string | undefined) {
  const parts = [fee ? `GH₵ ${cedis(fee, 2)} charge` : "", saved ? `GH₵ ${cedis(saved, 2)} to ${savedTo ?? "savings"}` : ""].filter(Boolean);
  return parts.length ? `, plus ${parts.join(" and ")}` : "";
}

async function savingsName(account: Account | null) {
  if (!account?.saveToId) return undefined;
  const [s] = await db.select({ name: savingsAccounts.name }).from(savingsAccounts).where(eq(savingsAccounts.id, account.saveToId));
  return s?.name;
}

async function ownCategory(userId: string, id: string) {
  const [c] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  if (!c) throw new UserError("Pick a category.", "categoryId");
  return c;
}

export async function addEntry(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = entrySchema.parse(formObject(fd));
    if (d.amount <= 0) throw new UserError("Enter an amount above zero.", "amount");
    const cat = await ownCategory(user.id, d.categoryId);
    const paid = await parsePaidWith(user, fd.get("paidWith") ?? fd.get("method"));

    let householdId: string | null = null;
    if (d.shared === "on" && d.kind === "expense") {
      const [m] = await db.select().from(householdMembers).where(eq(householdMembers.userId, user.id));
      householdId = m?.householdId ?? null;
    }
    let policyId: string | null = null;
    if (d.policyId) {
      const [p] = await db.select().from(insurancePolicies).where(and(eq(insurancePolicies.id, d.policyId), eq(insurancePolicies.userId, user.id)));
      if (!p) throw new UserError("Pick one of your policies.");
      policyId = p.id;
      await db.update(insurancePolicies).set({ lastPaidOn: d.occurredOn }).where(eq(insurancePolicies.id, p.id));
    }

    let fixedId: string | null = null;
    if (d.repeat === "on" && d.kind === "expense") {
      const [f] = await db
        .insert(fixedExpenses)
        .values({
          userId: user.id,
          categoryId: cat.id,
          name: d.name ?? cat.name,
          amountMinor: d.amount,
          dayOfMonth: dayOf(d.occurredOn),
          method: paid.method,
          accountId: paid.account?.id ?? null,
          noCharge: chargeFor(user, d, paid) === 0,
        })
        .returning({ id: fixedExpenses.id });
      fixedId = f.id;
    }

    const fee = chargeFor(user, d, paid);
    const save = await saveAmount(fd, paid.account, d.kind, cat.id, parseSave);
    const [tx] = await db.insert(transactions).values({
      userId: user.id,
      householdId,
      kind: d.kind,
      amountMinor: d.amount,
      categoryId: cat.id,
      name: d.name ?? cat.name,
      note: d.note,
      method: paid.method,
      accountId: paid.account?.id ?? null,
      occurredOn: d.occurredOn,
      source: "manual",
      fixedExpenseId: fixedId,
      insurancePolicyId: policyId,
      dedupeKey: fixedId ? `fixed:${fixedId}:${d.occurredOn.slice(0, 7)}` : null,
    }).returning();
    if (fee) await syncCharge(user.id, tx, fee);
    const saved = save ? await syncAutoSave(user, tx, paid.account, save) : 0;
    return d.kind === "income" ? "Income saved" : `Expense saved${extras(fee, saved, await savingsName(paid.account))}`;
  });
}

export async function updateEntry(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const id = zUuid.parse(fd.get("id"));
    const d = entrySchema.omit({ repeat: true, shared: true, policyId: true }).parse(formObject(fd));
    if (d.amount <= 0) throw new UserError("Enter an amount above zero.", "amount");
    const cat = await ownCategory(user.id, d.categoryId);
    const paid = await parsePaidWith(user, fd.get("paidWith") ?? fd.get("method"));
    const [prev] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));
    if (!prev) throw new UserError("That entry no longer exists.");
    const [res] = await db
      .update(transactions)
      .set({ kind: d.kind, amountMinor: d.amount, categoryId: cat.id, name: d.name ?? cat.name, note: d.note, method: paid.method, accountId: paid.account?.id ?? null, occurredOn: d.occurredOn })
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id)))
      .returning();
    if (!res) throw new UserError("That entry no longer exists.");
    // Charges and automatic savings are attached to a payment; they don't get their own.
    if (res.source === "autosave") await adjustSaving(prev, res.amountMinor);
    else if (res.source !== "fee") {
      await syncCharge(user.id, res, chargeFor(user, d, paid));
      await syncAutoSave(user, res, paid.account, await saveAmount(fd, paid.account, d.kind, cat.id, parseSave));
    }
    return "Entry updated";
  });
}

export async function deleteEntry(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const id = zUuid.parse(fd.get("id"));
    await releaseSavings(user.id, [id]);
    await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));
    return "Entry deleted";
  });
}
