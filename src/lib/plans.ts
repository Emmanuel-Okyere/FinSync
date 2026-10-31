import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { fixedExpenses, setAsidePayouts, setAsides, transactions } from "@/db/schema";
import { addDays, diffDays } from "@/lib/dates";

type Fixed = typeof fixedExpenses.$inferSelect;
export type SetAside = typeof setAsides.$inferSelect;

const roundUpCedi = (minor: number) => Math.ceil(minor / 100) * 100;

/* ------------------------------------------------------------ Bills that change */

export type BillSuggestion = { suggested: number; recent: { on: string; amount: number }[] };

/**
 * For bills whose amount changes (electricity, water): the last 3 payments before `before`
 * (within a year) and their average, rounded up to the cedi.
 * A payment is anything logged against the bill, or in its category under the bill's name.
 */
export async function billSuggestions(userId: string, bills: Fixed[], before: string) {
  const varying = bills.filter((f) => f.varies);
  const out = new Map<string, BillSuggestion>();
  if (!varying.length) return out;
  const rows = await db
    .select({
      fid: fixedExpenses.id,
      on: transactions.occurredOn,
      amount: transactions.amountMinor,
    })
    .from(fixedExpenses)
    .innerJoin(
      transactions,
      and(
        eq(transactions.userId, fixedExpenses.userId),
        eq(transactions.kind, "expense"),
        sql`${transactions.feeForId} is null`,
        sql`(${transactions.fixedExpenseId} = ${fixedExpenses.id} or (${transactions.categoryId} = ${fixedExpenses.categoryId} and lower(${transactions.name}) = lower(${fixedExpenses.name})))`,
      ),
    )
    .where(
      and(
        eq(fixedExpenses.userId, userId),
        inArray(
          fixedExpenses.id,
          varying.map((f) => f.id),
        ),
        lt(transactions.occurredOn, before),
        sql`${transactions.occurredOn} >= ${addDays(before, -366)}`,
      ),
    )
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
  for (const f of varying) {
    const recent = rows
      .filter((r) => r.fid === f.id && r.amount > 0)
      .slice(0, 3)
      .map((r) => ({ on: r.on, amount: r.amount }));
    if (recent.length) out.set(f.id, { suggested: roundUpCedi(recent.reduce((s, r) => s + r.amount, 0) / recent.length), recent });
  }
  return out;
}

/* ------------------------------------------------------------ Set-asides */

/**
 * Money in each set-aside's pot: opening amount + contributions − payouts. With `before`, only
 * contributions before that day count (a cycle's own contributions are its plan being met), while
 * every payout does (paying the bill empties the pot whenever it happens).
 */
export async function setAsideBalances(userId: string, list: SetAside[], before?: string) {
  const out = new Map<string, number>(list.map((s) => [s.id, s.openingMinor]));
  if (!list.length) return out;
  const [ins, outs] = await Promise.all([
    db
      .select({ categoryId: transactions.categoryId, total: sql<string>`sum(${transactions.amountMinor})` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.kind, "expense"),
          sql`${transactions.feeForId} is null`,
          inArray(
            transactions.categoryId,
            list.map((s) => s.categoryId),
          ),
          before ? lt(transactions.occurredOn, before) : undefined,
        ),
      )
      .groupBy(transactions.categoryId),
    db
      .select({ id: setAsidePayouts.setAsideId, total: sql<string>`sum(${setAsidePayouts.amountMinor})` })
      .from(setAsidePayouts)
      .where(eq(setAsidePayouts.userId, userId))
      .groupBy(setAsidePayouts.setAsideId),
  ]);
  for (const s of list) {
    const added = Number(ins.find((r) => r.categoryId === s.categoryId)?.total ?? 0);
    const paid = Number(outs.find((r) => r.id === s.id)?.total ?? 0);
    out.set(s.id, s.openingMinor + added - paid);
  }
  return out;
}

/**
 * What to put aside in a cycle: what's still missing, spread over the cycles left before it's due
 * (the whole gap once the due date is inside this cycle or past). Rounded up to the cedi.
 */
export function setAsidePerCycle(s: Pick<SetAside, "targetMinor" | "dueOn">, balance: number, start: string, end: string) {
  const missing = s.targetMinor - balance;
  if (missing <= 0) return 0;
  const len = diffDays(start, end) + 1;
  const cycles = Math.max(1, Math.floor(diffDays(start, s.dueOn) / len));
  return roundUpCedi(missing / cycles);
}

/** Planned amount per set-aside category for a cycle starting `start`. */
export async function setAsidePlans(userId: string, start: string, end: string) {
  const list = await db.select().from(setAsides).where(and(eq(setAsides.userId, userId), eq(setAsides.active, true)));
  const balances = await setAsideBalances(userId, list, start);
  return new Map(list.map((s) => [s.categoryId, setAsidePerCycle(s, balances.get(s.id) ?? 0, start, end)]));
}

/** Every set-aside category (active or not), so cycles don't carry their lines over like ordinary ones. */
export async function setAsideCategoryIds(userId: string) {
  const rows = await db.select({ c: setAsides.categoryId }).from(setAsides).where(eq(setAsides.userId, userId));
  return new Set(rows.map((r) => r.c));
}

/* ------------------------------------------------------------ Automatic savings */

/**
 * Automatic savings a bank takes per payment, planned per savings category from what they came to
 * over the 90 days before the cycle, scaled to its length and rounded up to the cedi.
 */
export async function autoSavePlans(userId: string, start: string, end: string) {
  const rows = await db
    .select({ categoryId: transactions.categoryId, total: sql<string>`sum(${transactions.amountMinor})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.source, "autosave"),
        lt(transactions.occurredOn, start),
        sql`${transactions.occurredOn} >= ${addDays(start, -90)}`,
      ),
    )
    .groupBy(transactions.categoryId);
  const len = diffDays(start, end) + 1;
  return new Map(rows.filter((r) => r.categoryId).map((r) => [r.categoryId!, roundUpCedi((Number(r.total) / 90) * len)]));
}
