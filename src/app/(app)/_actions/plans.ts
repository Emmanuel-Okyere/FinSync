"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { budgetLines, budgetPeriods, categories, savingsAccounts, setAsidePayouts, setAsides, transactions } from "@/db/schema";
import { FormState, UserError, formObject, run, zDate, zMoney, zMoneyOpt, zText, zUuid } from "@/lib/action";
import { actionUser, type SessionUser } from "@/lib/auth/session";
import { ensurePeriod, getPeriodView, leftoverOf } from "@/lib/budget";
import { addDays, addYears, fmtCycle, fmtDue, todayISO } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { setAsideBalances, setAsidePerCycle } from "@/lib/plans";

const BUCKET = z.enum(["needs", "wants", "savings"]).catch("needs");

/** Category name for a set-aside's contributions; shown as its budget line. */
const potName = (name: string) => `Set aside · ${name}`.slice(0, 60);

async function ownSetAside(user: SessionUser, id: string) {
  const [s] = await db.select().from(setAsides).where(and(eq(setAsides.id, id), eq(setAsides.userId, user.id)));
  if (!s) throw new UserError("That set-aside no longer exists.");
  return s;
}

/** Puts (or updates) this cycle's line for a set-aside, sized from what's in the pot before the cycle began. */
async function planThisCycle(user: SessionUser, s: typeof setAsides.$inferSelect) {
  const p = await ensurePeriod(user, todayISO());
  const balances = await setAsideBalances(user.id, [s], p.start);
  const amount = s.active ? setAsidePerCycle(s, balances.get(s.id) ?? 0, p.start, p.end) : 0;
  await db
    .insert(budgetLines)
    .values({ monthId: p.id, userId: user.id, categoryId: s.categoryId, plannedMinor: amount })
    .onConflictDoUpdate({ target: [budgetLines.monthId, budgetLines.categoryId], set: { plannedMinor: amount } });
  return amount;
}

const setAsideSchema = z.object({
  name: zText(40, "Name"),
  target: zMoney("Amount needed"),
  dueOn: zDate,
  repeat: z.enum(["yearly", "once"]).catch("yearly"),
  bucket: BUCKET,
  opening: zMoneyOpt("Already saved"),
});

export async function saveSetAside(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = setAsideSchema.parse(formObject(fd));
    const today = todayISO();
    if (d.target <= 0) throw new UserError("Enter how much the bill will be.", "target");
    if (d.dueOn <= today) throw new UserError("Pick a due date after today.", "dueOn");
    if (d.dueOn > addYears(today, 5)) throw new UserError("Pick a due date within 5 years.", "dueOn");
    const opening = d.opening ?? 0;
    if (opening > d.target) throw new UserError("That's more than the bill.", "opening");
    const id = fd.get("id") ? zUuid.parse(fd.get("id")) : null;

    let s;
    if (id) {
      const cur = await ownSetAside(user, id);
      await db
        .update(categories)
        .set({ name: potName(d.name), bucket: d.bucket, archived: false })
        .where(and(eq(categories.id, cur.categoryId), eq(categories.userId, user.id)))
        .catch(() => {
          throw new UserError("You already have a set-aside with that name.", "name");
        });
      [s] = await db
        .update(setAsides)
        .set({ name: d.name, targetMinor: d.target, dueOn: d.dueOn, repeat: d.repeat, openingMinor: opening, active: true })
        .where(eq(setAsides.id, cur.id))
        .returning();
    } else {
      const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(setAsides).where(eq(setAsides.userId, user.id));
      if (count.n >= 20) throw new UserError("You can have up to 20 set-asides.");
      const [cat] = await db
        .insert(categories)
        .values({ userId: user.id, name: potName(d.name), bucket: d.bucket, icon: "calendar" })
        .onConflictDoNothing()
        .returning();
      if (!cat) throw new UserError("You already have a set-aside with that name.", "name");
      [s] = await db
        .insert(setAsides)
        .values({ userId: user.id, categoryId: cat.id, name: d.name, targetMinor: d.target, dueOn: d.dueOn, repeat: d.repeat, openingMinor: opening })
        .returning();
    }
    const amount = await planThisCycle(user, s);
    return amount ? `${d.name}: put aside GH₵ ${cedis(amount)} this cycle` : `${d.name} saved`;
  });
}

export async function deleteSetAside(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const s = await ownSetAside(user, zUuid.parse(fd.get("id")));
    const p = await ensurePeriod(user, todayISO());
    // Past contributions stay in history under the (now hidden) category.
    await db.batch([
      db.delete(setAsides).where(eq(setAsides.id, s.id)),
      db.update(categories).set({ archived: true }).where(and(eq(categories.id, s.categoryId), eq(categories.userId, user.id))),
      db.delete(budgetLines).where(and(eq(budgetLines.monthId, p.id), eq(budgetLines.categoryId, s.categoryId))),
    ]);
    return `${s.name} removed`;
  });
}

/** The bill arrived: pay it from the pot. It was budgeted as it was put aside, so it doesn't count again now. */
export async function paySetAside(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const s = await ownSetAside(user, zUuid.parse(fd.get("id")));
    const d = z.object({ amount: zMoney("Amount paid"), date: zDate }).parse(formObject(fd));
    if (d.amount <= 0) throw new UserError("Enter what you paid.", "amount");
    if (d.date > todayISO()) throw new UserError("That date is in the future.", "date");
    const balance = (await setAsideBalances(user.id, [s])).get(s.id) ?? 0;
    if (d.amount > balance) throw new UserError(`Only GH₵ ${cedis(balance, 2)} is set aside. Log the rest as a normal expense.`, "amount");
    const next = s.repeat === "yearly" ? addYears(s.dueOn, 1) : s.dueOn;
    await db.batch([
      db.insert(setAsidePayouts).values({ setAsideId: s.id, userId: user.id, amountMinor: d.amount, paidOn: d.date }),
      db
        .update(setAsides)
        .set(s.repeat === "yearly" ? { dueOn: next } : { active: false })
        .where(eq(setAsides.id, s.id)),
    ]);
    const updated = { ...s, dueOn: next, active: s.repeat === "yearly" };
    await planThisCycle(user, updated);
    return s.repeat === "yearly" ? `${s.name} paid. Next one due ${fmtDue(next)}` : `${s.name} paid`;
  });
}

/* ------------------------------------------------------------ Payday review */

async function ownFinishedPeriod(user: SessionUser, id: string) {
  const [p] = await db.select().from(budgetPeriods).where(and(eq(budgetPeriods.id, id), eq(budgetPeriods.userId, user.id)));
  if (!p) throw new UserError("That budget cycle no longer exists.");
  if (p.end >= todayISO()) throw new UserError("That cycle hasn't finished yet.");
  if (p.reviewedAt) throw new UserError("You've already dealt with that cycle's leftover.");
  return p;
}

/**
 * What to do with a finished cycle's leftover: keep it for the current cycle, or put it in a savings
 * category or a set-aside (recorded on the finished cycle's last day, so it counts as that cycle's money).
 */
export async function reviewLeftover(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const prev = await ownFinishedPeriod(user, zUuid.parse(fd.get("periodId")));
    const d = z.object({ amount: zMoney("Amount"), to: z.string().min(1, "Choose where it goes") }).parse(formObject(fd));
    if (d.amount <= 0) throw new UserError("Enter an amount.", "amount");
    const leftover = leftoverOf(await getPeriodView(user, prev.start));
    if (d.amount > leftover) throw new UserError(`${fmtCycle(prev.start, prev.end)} has GH₵ ${cedis(leftover, 2)} left.`, "amount");

    let msg: string;
    if (d.to === "keep") {
      const cur = await ensurePeriod(user, addDays(prev.end, 1));
      await db.batch([
        db.update(budgetPeriods).set({ carriedOutMinor: sql`${budgetPeriods.carriedOutMinor} + ${d.amount}` }).where(eq(budgetPeriods.id, prev.id)),
        db.update(budgetPeriods).set({ carriedInMinor: sql`${budgetPeriods.carriedInMinor} + ${d.amount}` }).where(eq(budgetPeriods.id, cur.id)),
      ]);
      msg = `GH₵ ${cedis(d.amount, 2)} added to ${fmtCycle(cur.start, cur.end)}`;
    } else {
      const categoryId = zUuid.parse(d.to.replace(/^cat:/, ""));
      const [cat] = await db.select().from(categories).where(and(eq(categories.id, categoryId), eq(categories.userId, user.id), eq(categories.kind, "expense")));
      if (!cat) throw new UserError("Choose where it goes.", "to");
      const [pot] = await db.select().from(setAsides).where(and(eq(setAsides.categoryId, cat.id), eq(setAsides.userId, user.id)));
      if (!pot && cat.bucket !== "savings") throw new UserError("Leftovers can go to savings or a set-aside.", "to");
      await db.insert(transactions).values({
        userId: user.id,
        kind: "expense",
        amountMinor: d.amount,
        categoryId: cat.id,
        name: pot ? `Towards ${pot.name}` : `Leftover saved`,
        method: "other",
        occurredOn: prev.end,
        source: "review",
      });
      // Optionally grow a savings account's balance by the same amount.
      if (!pot && fd.get("accountId")) {
        const accountId = zUuid.parse(fd.get("accountId"));
        await db
          .update(savingsAccounts)
          .set({ balanceMinor: sql`${savingsAccounts.balanceMinor} + ${d.amount}`, updatedAt: new Date() })
          .where(and(eq(savingsAccounts.id, accountId), eq(savingsAccounts.userId, user.id)));
      }
      if (pot) await planThisCycle(user, pot); // less left to find this cycle
      msg = pot ? `GH₵ ${cedis(d.amount, 2)} put towards ${pot.name}` : `GH₵ ${cedis(d.amount, 2)} moved to ${cat.name}`;
    }
    if (leftover - d.amount < 100) await db.update(budgetPeriods).set({ reviewedAt: new Date() }).where(eq(budgetPeriods.id, prev.id));
    return msg;
  });
}

export async function skipReview(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const prev = await ownFinishedPeriod(user, zUuid.parse(fd.get("periodId")));
    await db.update(budgetPeriods).set({ reviewedAt: new Date() }).where(eq(budgetPeriods.id, prev.id));
    return "Left as it is";
  });
}
