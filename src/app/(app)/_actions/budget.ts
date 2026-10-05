"use server";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { budgetLines, budgetMonths, categories, fixedExpenses, transactions, users } from "@/db/schema";
import { FormState, UserError, formObject, run, zMoney, zText, zUuid } from "@/lib/action";
import { actionUser, type SessionUser } from "@/lib/auth/session";
import { incomeTotal } from "@/lib/budget";
import { addMonths, monthEnd, monthStart, todayISO } from "@/lib/dates";
import { parseSchemeForm } from "@/lib/scheme-form";
import { ICON_CHOICES } from "@/lib/categories";

/** Loads a line and proves it belongs to the user. */
async function ownLine(user: SessionUser, lineId: string) {
  const [row] = await db
    .select({ line: budgetLines, month: budgetMonths.month, catName: categories.name })
    .from(budgetLines)
    .innerJoin(budgetMonths, eq(budgetMonths.id, budgetLines.monthId))
    .innerJoin(categories, eq(categories.id, budgetLines.categoryId))
    .where(and(eq(budgetLines.id, lineId), eq(budgetLines.userId, user.id)));
  if (!row) throw new UserError("That budget line no longer exists.");
  return row;
}

async function lineActual(userId: string, categoryId: string, month: string) {
  const [r] = await db
    .select({ total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, "expense"),
        eq(transactions.categoryId, categoryId),
        gte(transactions.occurredOn, month),
        lte(transactions.occurredOn, monthEnd(month)),
      ),
    );
  return Number(r.total);
}

/** The date to use for system entries in a month: today if it's the current month, else the 1st. */
function entryDate(month: string) {
  const t = todayISO();
  return monthStart(t) === month ? t : month;
}

/** Strike a line off (fills Actual with the plan) or un-strike it (removes that fill). */
export async function toggleLine(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const { line, month, catName } = await ownLine(user, zUuid.parse(fd.get("id")));
    if (!line.done) {
      const actual = await lineActual(user.id, line.categoryId, month);
      const gap = line.plannedMinor - actual;
      if (gap > 0) {
        await db.insert(transactions).values({
          userId: user.id,
          kind: "expense",
          amountMinor: gap,
          categoryId: line.categoryId,
          name: catName,
          method: "other",
          occurredOn: entryDate(month),
          source: "strike",
          note: "Struck off in budget",
        });
      }
      await db.update(budgetLines).set({ done: true }).where(eq(budgetLines.id, line.id));
      return `${catName} struck off`;
    }
    await db.batch([
      db
        .delete(transactions)
        .where(
          and(
            eq(transactions.userId, user.id),
            eq(transactions.categoryId, line.categoryId),
            inArray(transactions.source, ["strike", "adjust"]),
            gte(transactions.occurredOn, month),
            lte(transactions.occurredOn, monthEnd(month)),
          ),
        ),
      db.update(budgetLines).set({ done: false }).where(eq(budgetLines.id, line.id)),
    ]);
    return `${catName} reopened`;
  });
}

/** "Paid less/more than planned?" Adjusts Actual via a single adjustment entry. */
export async function setLineActual(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const { line, month, catName } = await ownLine(user, zUuid.parse(fd.get("id")));
    const target = zMoney("Actual").parse(fd.get("actual") ?? "");
    const actual = await lineActual(user.id, line.categoryId, month);
    const delta = target - actual;
    if (delta === 0) return "No change";

    const [adj] = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.categoryId, line.categoryId),
          inArray(transactions.source, ["strike", "adjust"]),
          gte(transactions.occurredOn, month),
          lte(transactions.occurredOn, monthEnd(month)),
        ),
      )
      .limit(1);

    if (adj) {
      const next = adj.amountMinor + delta;
      if (next > 0) await db.update(transactions).set({ amountMinor: next }).where(eq(transactions.id, adj.id));
      else if (next === 0) await db.delete(transactions).where(eq(transactions.id, adj.id));
      else throw new UserError("That's less than the entries you logged. Edit those entries instead.", "actual");
    } else if (delta > 0) {
      await db.insert(transactions).values({
        userId: user.id,
        kind: "expense",
        amountMinor: delta,
        categoryId: line.categoryId,
        name: catName,
        method: "other",
        occurredOn: entryDate(month),
        source: "adjust",
        note: "Adjusted in budget",
      });
    } else {
      throw new UserError("That's less than the entries you logged. Edit those entries instead.", "actual");
    }
    await db.update(budgetLines).set({ done: true }).where(eq(budgetLines.id, line.id));
    return `${catName} updated`;
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
    return `${catName} removed from this month`;
  });
}

/** Add a line to a month, creating the category if it's new. */
export async function addLine(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z
      .object({
        month: z.string().regex(/^\d{4}-\d{2}-01$/),
        name: zText(40, "Name"),
        bucket: z.enum(["needs", "wants", "savings", "giving"]),
        icon: z.enum(ICON_CHOICES as [string, ...string[]]).default("tag"),
        planned: zMoney("Planned"),
      })
      .parse(formObject(fd));
    const [m] = await db.select().from(budgetMonths).where(and(eq(budgetMonths.userId, user.id), eq(budgetMonths.month, d.month)));
    if (!m) throw new UserError("Open that month first.");
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
    if (!res.length) throw new UserError(`${cat.name} is already in this month.`, "name");
    return `${cat.name} added`;
  });
}

/** Move planned money between two lines of the same month (cut suggestions). */
export async function moveBetweenLines(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const from = await ownLine(user, zUuid.parse(fd.get("from")));
    const to = await ownLine(user, zUuid.parse(fd.get("to")));
    const amount = zMoney().parse(fd.get("amount") ?? "");
    if (from.line.monthId !== to.line.monthId) throw new UserError("Lines must be in the same month.");
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

/** Change scheme: saves as default and applies to this month and/or next. */
export async function applyScheme(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const scheme = parseSchemeForm(fd);
    const target = String(fd.get("apply") ?? "this");
    const month = z.string().regex(/^\d{4}-\d{2}-01$/).parse(fd.get("month"));
    await db.update(users).set({ scheme, updatedAt: new Date() }).where(eq(users.id, user.id));
    if (target === "this") {
      await db
        .update(budgetMonths)
        .set({ scheme, incomeMinor: await incomeTotal(user.id) })
        .where(and(eq(budgetMonths.userId, user.id), eq(budgetMonths.month, month)));
      return `Applied ${scheme.name} to this month`;
    }
    // Next month picks up the saved default when it's first opened; refresh it if it already exists.
    await db
      .update(budgetMonths)
      .set({ scheme })
      .where(and(eq(budgetMonths.userId, user.id), eq(budgetMonths.month, addMonths(month, 1))));
    return `${scheme.name} will be used from next month`;
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
      // Add it to this month's plan right away.
      const [m] = await db
        .select()
        .from(budgetMonths)
        .where(and(eq(budgetMonths.userId, user.id), eq(budgetMonths.month, monthStart(todayISO()))));
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
    await db
      .update(fixedExpenses)
      .set({ active: sql`NOT ${fixedExpenses.active}` })
      .where(and(eq(fixedExpenses.id, id), eq(fixedExpenses.userId, user.id)));
    return "Updated";
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
