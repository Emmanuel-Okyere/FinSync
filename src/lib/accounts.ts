import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { accounts, categories, savingsAccounts, transactions } from "@/db/schema";
import { UserError, zUuid } from "@/lib/action";
import type { SessionUser } from "@/lib/auth/session";
import { METHOD_VALUES, feeFor, feeRules, ruleFor } from "@/lib/fees";

export type Account = typeof accounts.$inferSelect;

/** Largest automatic saving we'll record for one payment (GH₵ 10,000), to catch typos. */
const MAX_SAVE = 1_000_000;

export function userAccounts(userId: string) {
  return db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.archived, false))).orderBy(accounts.name);
}

/** The payment method an account implies. */
export const accountMethod = (a: Pick<Account, "kind">) => ((METHOD_VALUES as readonly string[]).includes(a.kind) ? a.kind : "other");

/**
 * "Paid with" from a form: `a:<accountId>` (one of the user's accounts) or `m:<method>` / a bare method.
 * Returns the method to record and the account, if any.
 */
export async function parsePaidWith(user: SessionUser, raw: FormDataEntryValue | null, fallback = "momo") {
  const v = String(raw ?? "").trim();
  if (v.startsWith("a:")) {
    const id = zUuid.parse(v.slice(2));
    const [a] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, user.id)));
    if (!a) throw new UserError("Pick one of your accounts.", "paidWith");
    return { method: accountMethod(a), account: a };
  }
  const m = v.replace(/^m:/, "") || fallback;
  if (!(METHOD_VALUES as readonly string[]).includes(m)) throw new UserError("Pick how you paid.", "paidWith");
  return { method: m, account: null as Account | null };
}

/** The charge the rules give for a payment (the account's own rule first). */
export function accountFee(user: SessionUser, amount: number, method: string, account: Account | null) {
  return feeFor(amount, ruleFor(method, feeRules(user.settings.fees), account?.fee));
}

/** Whether a payment from this account, in this category, normally triggers the automatic saving. */
export function savesOn(account: Account | null, categoryId: string | null) {
  return Boolean(account?.saveToId && account.saveMinor > 0 && !(categoryId && account.saveExcept.includes(categoryId)));
}

const parentTx = alias(transactions, "p");

/** Last amount saved for a payment from this account in this category (falls back to the account's usual amount). */
export async function rememberedSave(account: Account, categoryId: string | null) {
  if (!categoryId) return account.saveMinor;
  const [r] = await db
    .select({ amount: transactions.amountMinor })
    .from(transactions)
    .innerJoin(parentTx, eq(parentTx.id, transactions.saveForId))
    .where(and(eq(transactions.userId, account.userId), eq(transactions.accountId, account.id), eq(parentTx.categoryId, categoryId)))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(1);
  return r?.amount ?? account.saveMinor;
}

/**
 * The automatic saving for an expense. The form sends saveUi=1 with addSave/save; without the UI
 * (auto-logged bills, imports) the account's rule applies.
 */
export async function saveAmount(fd: FormData | null, account: Account | null, kind: string, categoryId: string | null, parse: (s: string) => number) {
  if (kind !== "expense" || !account?.saveToId) return 0;
  let amount: number;
  if (fd?.get("saveUi")) {
    if (fd.get("addSave") !== "on") return 0;
    const raw = String(fd.get("save") ?? "").trim();
    amount = raw ? parse(raw) : await rememberedSave(account, categoryId);
  } else {
    amount = savesOn(account, categoryId) ? await rememberedSave(account, categoryId) : 0;
  }
  if (amount > MAX_SAVE) throw new UserError("That saving looks too high. Check it.", "save");
  return amount;
}

/** Category an automatic saving is counted under: one per savings place, in the Savings bucket. */
async function savingsCategoryId(userId: string, name: string) {
  await db.insert(categories).values({ userId, name, bucket: "savings", icon: "wallet" }).onConflictDoNothing();
  const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.userId, userId), eq(categories.name, name)));
  return c.id;
}

const bump = (id: string, delta: number) =>
  db.update(savingsAccounts).set({ balanceMinor: sql`greatest(0, ${savingsAccounts.balanceMinor} + ${delta})`, updatedAt: new Date() }).where(eq(savingsAccounts.id, id));

/**
 * Keeps a payment's automatic saving in step (creates, updates or removes it) and moves the
 * savings place's balance by the difference. `amount` 0 removes it.
 */
export async function syncAutoSave(
  user: SessionUser,
  parent: { id: string; name: string; method: string; occurredOn: string; accountId: string | null },
  account: Account | null,
  amount: number,
) {
  const [existing] = await db.select().from(transactions).where(and(eq(transactions.saveForId, parent.id), eq(transactions.userId, user.id)));
  const toId = amount > 0 ? (account?.saveToId ?? null) : null;
  const [to] = toId ? await db.select().from(savingsAccounts).where(and(eq(savingsAccounts.id, toId), eq(savingsAccounts.userId, user.id))) : [];
  if (!to) {
    if (existing) {
      await db.delete(transactions).where(eq(transactions.id, existing.id));
      if (existing.savingsAccountId) await bump(existing.savingsAccountId, -existing.amountMinor);
    }
    return 0;
  }
  const values = {
    amountMinor: amount,
    name: `${to.name} · ${parent.name}`.slice(0, 80),
    method: parent.method,
    occurredOn: parent.occurredOn,
    accountId: parent.accountId,
    savingsAccountId: to.id,
    categoryId: await savingsCategoryId(user.id, to.name),
  };
  if (existing) {
    await db.update(transactions).set(values).where(eq(transactions.id, existing.id));
    if (existing.savingsAccountId === to.id) await bump(to.id, amount - existing.amountMinor);
    else {
      if (existing.savingsAccountId) await bump(existing.savingsAccountId, -existing.amountMinor);
      await bump(to.id, amount);
    }
  } else {
    await db.insert(transactions).values({ ...values, userId: user.id, kind: "expense", source: "autosave", saveForId: parent.id });
    await bump(to.id, amount);
  }
  return amount;
}

/** Before entries are deleted: take their automatic savings (and any that are themselves savings) back out of the balances. */
export async function releaseSavings(userId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await db
    .select({ amount: transactions.amountMinor, to: transactions.savingsAccountId })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.source, "autosave"), or(inArray(transactions.saveForId, ids), inArray(transactions.id, ids))));
  for (const r of rows) if (r.to) await bump(r.to, -r.amount);
}

/** An automatic saving edited directly: move the balance by the change. */
export async function adjustSaving(prev: { savingsAccountId: string | null; amountMinor: number }, next: number) {
  if (prev.savingsAccountId && next !== prev.amountMinor) await bump(prev.savingsAccountId, next - prev.amountMinor);
}
