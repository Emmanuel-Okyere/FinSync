"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { budgetLines, budgetPeriods, categories, fixedExpenses, transactions, users } from "@/db/schema";
import { FormState, UserError, formObject, run, zMoney, zText, zUuid } from "@/lib/action";
import { actionUser, type SessionUser } from "@/lib/auth/session";
import { ensurePeriod, incomeTotal } from "@/lib/budget";
import { addDays, todayISO } from "@/lib/dates";
import { parseSchemeForm } from "@/lib/scheme-form";
import { ICON_CHOICES } from "@/lib/categories";
import { cedis } from "@/lib/money";

/** Loads a line and proves it belongs to the user. */
async function ownLine(user: SessionUser, lineId: string) {
  const [row] = await db
    .select({ line: budgetLines, period: { start: budgetPeriods.start, end: budgetPeriods.end }, catName: categories.name })
    .from(budgetLines)
    .innerJoin(budgetPeriods, eq(budgetPeriods.id, budgetLines.monthId))
    .innerJoin(categories, eq(categories.id, budgetLines.categoryId))
    .where(and(eq(budgetLines.id, lineId), eq(budgetLines.userId, user.id)));
  if (!row) throw new UserError("That budget line no longer exists.");
  return row;
}

type Range = { start: string; end: string };

/** The date to use for system entries in a cycle: today if it's the current cycle, else its first day. */
function entryDate(period: Range) {
  const t = todayISO();
  return t >= period.start && t <= period.end ? t : period.start;
}

/**
 * "Mark paid": optionally records a real payment against the line (amount you actually paid),
 * then ticks the line as done for this cycle. Nothing is invented: no amount, no entry.
 */
export async function markLinePaid(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const { line, period, catName } = await ownLine(user, zUuid.parse(fd.get("id")));
    const raw = String(fd.get("amount") ?? "").trim();
    const amount = raw ? zMoney("Amount paid").parse(raw) : 0;
    if (amount > 0) {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(entryDate(period)).parse(fd.get("date"));
      const method = z.enum(["momo", "card", "bank", "cash", "other"]).catch("momo").parse(fd.get("method"));
      await db.insert(transactions).values({
        userId: user.id,
        kind: "expense",
        amountMinor: amount,
        categoryId: line.categoryId,
        name: catName,
        method,
        occurredOn: date,
        source: "manual",
      });
    }
    await db.update(budgetLines).set({ done: true }).where(eq(budgetLines.id, line.id));
    return amount > 0 ? `${catName}: GH₵ ${cedis(amount, 2)} paid` : `${catName} marked done`;
  });
}

/** Un-tick a line. Entries you logged stay exactly as they are. */
export async function reopenLine(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const { line, catName } = await ownLine(user, zUuid.parse(fd.get("id")));
    await db.update(budgetLines).set({ done: false }).where(eq(budgetLines.id, line.id));
    return `${catName} reopened`;
  });
}

export async function setLinePlanned(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const { line, catName } = await ownLine(user, zUuid.parse(fd.get("id")));
    const planned = zMoney("Planned").parse(fd.get("planned") ?? "");
    await db.update(budgetLines).set({ plannedMinor: planned }).where(eq(budgetLines.id, line.id));
    return `${catName} plan updated`;
  });
}

export async function removeLine(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const { line, catName } = await ownLine(user, zUuid.parse(fd.get("id")));
    await db.delete(budgetLines).where(eq(budgetLines.id, line.id));
    return `${catName} removed from this cycle`;
  });
}

/** Add a line to a cycle, creating the category if it's new. */
export async function addLine(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z
      .object({
        periodId: zUuid,
        name: zText(40, "Name"),
        bucket: z.enum(["needs", "wants", "savings", "giving"]),
        icon: z.enum(ICON_CHOICES as [string, ...string[]]).default("tag"),
        planned: zMoney("Planned"),
      })
      .parse(formObject(fd));
    const [m] = await db.select().from(budgetPeriods).where(and(eq(budgetPeriods.userId, user.id), eq(budgetPeriods.id, d.periodId)));
    if (!m) throw new UserError("That budget cycle no longer exists.");
    const [existing] = await db.select().from(categories).where(and(eq(categories.userId, user.id), sql`lower(${categories.name}) = lower(${d.name})`));
    const cat =
      existing ??
      (await db.insert(categories).values({ userId: user.id, name: d.name, bucket: d.bucket, icon: d.icon }).returning())[0];
    if (cat.kind !== "expense") throw new UserError("That name is an income category.", "name");
    if (cat.archived) await db.update(categories).set({ archived: false }).where(eq(categories.id, cat.id));
    const res = await db
      .insert(budgetLines)
      .values({ monthId: m.id, userId: user.id, categoryId: cat.id, plannedMinor: d.planned })
      .onConflictDoNothing()
      .returning({ id: budgetLines.id });
    if (!res.length) throw new UserError(`${cat.name} is already in this cycle.`, "name");
    return `${cat.name} added`;
  });
}

/** Move planned money between two lines of the same cycle (cut suggestions). */
export async function moveBetweenLines(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const from = await ownLine(user, zUuid.parse(fd.get("from")));
    const to = await ownLine(user, zUuid.parse(fd.get("to")));
    const amount = zMoney().parse(fd.get("amount") ?? "");
    if (from.line.monthId !== to.line.monthId) throw new UserError("Lines must be in the same cycle.");
    if (amount <= 0 || amount > from.line.plannedMinor) throw new UserError(`${from.catName} doesn't have that much planned.`);
    // Conditional update keeps the move safe under double-clicks.
    const moved = await db
      .update(budgetLines)
      .set({ plannedMinor: sql`${budgetLines.plannedMinor} - ${amount}` })
      .where(and(eq(budgetLines.id, from.line.id), gte(budgetLines.plannedMinor, amount)))
      .returning({ id: budgetLines.id });
    if (!moved.length) throw new UserError(`${from.catName} doesn't have that much planned.`);
    await db.update(budgetLines).set({ plannedMinor: sql`${budgetLines.plannedMinor} + ${amount}` }).where(eq(budgetLines.id, to.line.id));
    return `Moved GH₵ ${Math.round(amount / 100)} from ${from.catName} to ${to.catName}`;
  });
}

/** Change scheme: saves as default and applies to this cycle and/or the next. */
export async function applyScheme(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const scheme = parseSchemeForm(fd);
    const target = String(fd.get("apply") ?? "this");
    const periodId = zUuid.parse(fd.get("periodId"));
    const [p] = await db.select().from(budgetPeriods).where(and(eq(budgetPeriods.userId, user.id), eq(budgetPeriods.id, periodId)));
    if (!p) throw new UserError("That budget cycle no longer exists.");
    await db.update(users).set({ scheme, updatedAt: new Date() }).where(eq(users.id, user.id));
    if (target === "this") {
      await db.update(budgetPeriods).set({ scheme, incomeMinor: p.paidOn ? p.incomeMinor : await incomeTotal(user.id) }).where(eq(budgetPeriods.id, p.id));
      return `Applied ${scheme.name} to this cycle`;
    }
    // The next cycle picks up the saved default when it's first opened; refresh it if it already exists.
    await db
      .update(budgetPeriods)
      .set({ scheme })
      .where(and(eq(budgetPeriods.userId, user.id), eq(budgetPeriods.start, addDays(p.end, 1))));
    return `${scheme.name} will be used from next cycle`;
  });
}

/* ------------------------------------------------------------ Fixed expenses */

const fixedSchema = z.object({
  name: zText(60, "Name"),
  categoryId: zUuid,
  amount: zMoney(),
  day: z
    .string()
    .optional()
    .transform((s) => (s ? Number(s) : null))
    .pipe(z.number().int().min(1, "Day 1–31").max(31, "Day 1–31").nullable()),
});

async function ownCategoryId(userId: string, id: string) {
  const [c] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  if (!c) throw new UserError("Pick a category.", "categoryId");
  return c.id;
}

export async function saveFixedExpense(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = fixedSchema.parse(formObject(fd));
    const categoryId = await ownCategoryId(user.id, d.categoryId);
    const id = fd.get("id") ? zUuid.parse(fd.get("id")) : null;
    if (id) {
      const r = await db
        .update(fixedExpenses)
        .set({ name: d.name, categoryId, amountMinor: d.amount, dayOfMonth: d.day })
        .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, user.id)))
        .returning({ id: fixedExpenses.id });
      if (!r.length) throw new UserError("That fixed expense no longer exists.");
    } else {
      const [f] = await db
        .insert(fixedExpenses)
        .values({ userId: user.id, categoryId, name: d.name, amountMinor: d.amount, dayOfMonth: d.day })
        .returning();
      // Add it to this cycle's plan right away.
      const [m] = [await ensurePeriod(user, todayISO())];
      if (m) {
        await db
          .insert(budgetLines)
          .values({ monthId: m.id, userId: user.id, categoryId, plannedMinor: d.amount, fixedExpenseId: f.id })
          .onConflictDoUpdate({
            target: [budgetLines.monthId, budgetLines.categoryId],
            set: { plannedMinor: sql`${budgetLines.plannedMinor} + ${d.amount}`, fixedExpenseId: f.id },
          });
      }
    }
    return "Fixed expense saved";
  });
}

export async function toggleFixedExpense(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const id = zUuid.parse(fd.get("id"));
    const [f] = await db
      .update(fixedExpenses)
      .set({ active: sql`NOT ${fixedExpenses.active}` })
      .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, user.id)))
      .returning({ name: fixedExpenses.name, active: fixedExpenses.active });
    if (!f) throw new UserError("That fixed expense no longer exists.");
    return f.active ? `${f.name} resumed` : `${f.name} paused`;
  });
}

export async function deleteFixedExpense(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const id = zUuid.parse(fd.get("id"));
    await db.delete(fixedExpenses).where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, user.id)));
    return "Fixed expense removed";
  });
}

export async function setAutoAddFixed(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const on = fd.get("on") === "on";
    await db.update(users).set({ settings: { ...user.settings, autoAddFixed: on } }).where(eq(users.id, user.id));
    return on ? "Fixed costs will be logged on their day" : "Auto-logging off";
  });
}
