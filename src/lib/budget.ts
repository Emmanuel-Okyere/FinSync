import "server-only";
import { cache } from "react";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  budgetLines,
  budgetMonths,
  categories,
  fixedExpenses,
  incomes,
  transactions,
  type Scheme,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { DEFAULT_CATEGORIES, STARTER_SPLIT } from "@/lib/categories";
import { addMonths, daysInMonth, dayOf, diffDays, monthEnd, monthStart, nextPayday, todayISO, type WeekendShift } from "@/lib/dates";
import { DEFAULT_SCHEME, bucketFor } from "@/lib/schemes";

export async function ensureCategories(userId: string) {
  await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ userId, name: c.name, bucket: c.bucket, icon: c.icon, kind: c.kind ?? "expense" })))
    .onConflictDoNothing();
}

export async function incomeTotal(userId: string) {
  const [r] = await db
    .select({ total: sql<string>`coalesce(sum(${incomes.amountMinor}), 0)` })
    .from(incomes)
    .where(eq(incomes.userId, userId));
  return Number(r.total);
}

/**
 * Returns the budget month row, creating it (and its lines) the first time a month is opened.
 * Idempotent and race-safe: unique keys + ON CONFLICT, creation runs as one atomic batch.
 */
export async function ensureMonth(user: SessionUser, month: string) {
  const [existing] = await db
    .select()
    .from(budgetMonths)
    .where(and(eq(budgetMonths.userId, user.id), eq(budgetMonths.month, month)));
  if (existing) {
    if (month === monthStart(todayISO())) await autoLogFixed(user, existing.id, month);
    return existing;
  }

  const scheme: Scheme = user.scheme ?? DEFAULT_SCHEME;
  const income = await incomeTotal(user.id);
  const cats = await db.select().from(categories).where(eq(categories.userId, user.id));
  const byName = new Map(cats.map((c) => [c.name, c]));
  const fixed = await db
    .select()
    .from(fixedExpenses)
    .where(and(eq(fixedExpenses.userId, user.id), eq(fixedExpenses.active, true)));

  const planned = new Map<string, { planned: number; fixedId: string | null }>();
  for (const f of fixed) {
    const cur = planned.get(f.categoryId);
    planned.set(f.categoryId, { planned: (cur?.planned ?? 0) + f.amountMinor, fixedId: cur?.fixedId ?? f.id });
  }

  // Carry over variable lines from the previous month; otherwise seed a starter split.
  const [prev] = await db
    .select()
    .from(budgetMonths)
    .where(and(eq(budgetMonths.userId, user.id), eq(budgetMonths.month, addMonths(month, -1))));
  if (prev) {
    const prevLines = await db.select().from(budgetLines).where(eq(budgetLines.monthId, prev.id));
    for (const l of prevLines) if (!l.fixedExpenseId && !planned.has(l.categoryId)) planned.set(l.categoryId, { planned: l.plannedMinor, fixedId: null });
  } else {
    const catBucket = new Map(cats.map((c) => [c.id, bucketFor(scheme, c.bucket)]));
    for (const b of scheme.buckets) {
      const target = Math.round((income * b.pct) / 100);
      let used = 0;
      for (const [catId, p] of planned) if (catBucket.get(catId) === b.key) used += p.planned;
      const left = Math.max(0, target - used);
      const split = STARTER_SPLIT[b.key] ?? (b.key === "needs" ? [] : []);
      for (const [name, share] of split) {
        const c = byName.get(name);
        if (c && !planned.has(c.id)) planned.set(c.id, { planned: Math.floor((left * share) / 100) * 100, fixedId: null });
      }
    }
  }

  const monthId = crypto.randomUUID();
  try {
    const lineRows = [...planned].map(([categoryId, p]) => ({
      monthId,
      userId: user.id,
      categoryId,
      plannedMinor: p.planned,
      fixedExpenseId: p.fixedId,
    }));
    const ops = [
      db.insert(budgetMonths).values({ id: monthId, userId: user.id, month, scheme, incomeMinor: income }),
      ...(lineRows.length ? [db.insert(budgetLines).values(lineRows)] : []),
    ] as const;
    await db.batch(ops as unknown as Parameters<typeof db.batch>[0]);
  } catch (e) {
    // Lost a race with a parallel request that created the month first; fall through and read it.
    if (!String(e).includes("budget_months_user_month_uq")) throw e;
  }
  const [row] = await db
    .select()
    .from(budgetMonths)
    .where(and(eq(budgetMonths.userId, user.id), eq(budgetMonths.month, month)));
  if (month === monthStart(todayISO())) await autoLogFixed(user, row.id, month);
  return row;
}

/** Logs fixed expenses whose day has arrived (once per month, guarded by dedupe key). */
async function autoLogFixed(user: SessionUser, monthId: string, month: string) {
  if (!user.settings.autoAddFixed) return;
  const [m] = await db.select({ logged: budgetMonths.loggedFixed }).from(budgetMonths).where(eq(budgetMonths.id, monthId));
  const already = new Set(m?.logged ?? []);
  const today = todayISO();
  const day = dayOf(today);
  const fixed = await db
    .select()
    .from(fixedExpenses)
    .where(and(eq(fixedExpenses.userId, user.id), eq(fixedExpenses.active, true)));
  const due = fixed.filter((f) => !already.has(f.id) && f.dayOfMonth != null && Math.min(f.dayOfMonth, daysInMonth(month)) <= day);
  if (!due.length) return;
  // Record first, so an entry the user deletes later isn't logged again.
  await db
    .update(budgetMonths)
    .set({ loggedFixed: sql`${budgetMonths.loggedFixed} || ${JSON.stringify(due.map((f) => f.id))}::jsonb` })
    .where(eq(budgetMonths.id, monthId));
  const inserted = await db
    .insert(transactions)
    .values(
      due.map((f) => ({
        userId: user.id,
        kind: "expense",
        amountMinor: f.amountMinor,
        categoryId: f.categoryId,
        name: f.name,
        method: "bank",
        occurredOn: `${month.slice(0, 7)}-${String(Math.min(f.dayOfMonth!, daysInMonth(month))).padStart(2, "0")}`,
        source: "fixed",
        fixedExpenseId: f.id,
        dedupeKey: `fixed:${f.id}:${month.slice(0, 7)}`,
      })),
    )
    .onConflictDoNothing()
    .returning({ categoryId: transactions.categoryId });
  const catIds = inserted.map((r) => r.categoryId!).filter(Boolean);
  if (catIds.length) {
    await db
      .update(budgetLines)
      .set({ done: true })
      .where(and(eq(budgetLines.monthId, monthId), inArray(budgetLines.categoryId, catIds)));
  }
}

export type LineView = {
  id: string;
  categoryId: string;
  name: string;
  icon: string;
  bucket: string; // scheme bucket key
  planned: number;
  actual: number;
  done: boolean;
  fixed: boolean;
  entries: number;
};

export type BucketView = { key: string; name: string; pct: number; target: number; planned: number; actual: number };

export type MonthView = Awaited<ReturnType<typeof getMonthView>>;

/** Per-request memoised month view (layout and page share one computation). */
export const monthView = cache((user: SessionUser, month: string) => getMonthView(user, month));

export async function getMonthView(user: SessionUser, month: string) {
  await ensureCategories(user.id);
  const m = await ensureMonth(user, month);
  const end = monthEnd(month);

  const [lineRows, sums, incomeRows] = await Promise.all([
    db
      .select({
        id: budgetLines.id,
        categoryId: budgetLines.categoryId,
        planned: budgetLines.plannedMinor,
        done: budgetLines.done,
        fixedExpenseId: budgetLines.fixedExpenseId,
        name: categories.name,
        icon: categories.icon,
        catBucket: categories.bucket,
      })
      .from(budgetLines)
      .innerJoin(categories, eq(categories.id, budgetLines.categoryId))
      .where(eq(budgetLines.monthId, m.id)),
    db
      .select({
        categoryId: transactions.categoryId,
        total: sql<string>`sum(${transactions.amountMinor})`,
        n: sql<string>`count(*)`,
        catBucket: categories.bucket,
      })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.kind, "expense"),
          gte(transactions.occurredOn, month),
          lte(transactions.occurredOn, end),
        ),
      )
      .groupBy(transactions.categoryId, categories.bucket),
    db
      .select({ total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.kind, "income"),
          gte(transactions.occurredOn, month),
          lte(transactions.occurredOn, end),
        ),
      ),
  ]);

  const actualByCat = new Map(sums.map((s) => [s.categoryId ?? "none", { total: Number(s.total), n: Number(s.n), catBucket: s.catBucket }]));
  const scheme = m.scheme;

  const lines: LineView[] = lineRows
    .map((l) => ({
      id: l.id,
      categoryId: l.categoryId,
      name: l.name,
      icon: l.icon,
      bucket: bucketFor(scheme, l.catBucket),
      planned: l.planned,
      actual: actualByCat.get(l.categoryId)?.total ?? 0,
      entries: actualByCat.get(l.categoryId)?.n ?? 0,
      done: l.done,
      fixed: Boolean(l.fixedExpenseId),
    }))
    .sort((a, b) => scheme.buckets.findIndex((x) => x.key === a.bucket) - scheme.buckets.findIndex((x) => x.key === b.bucket) || b.planned - a.planned);

  // Spending in categories without a line still counts toward its bucket.
  const lineCats = new Set(lines.map((l) => l.categoryId));
  const buckets: BucketView[] = scheme.buckets.map((b) => ({
    ...b,
    target: Math.round((m.incomeMinor * b.pct) / 100),
    planned: lines.filter((l) => l.bucket === b.key).reduce((s, l) => s + l.planned, 0),
    actual: lines.filter((l) => l.bucket === b.key).reduce((s, l) => s + l.actual, 0),
  }));
  for (const s of sums) {
    if (s.categoryId && lineCats.has(s.categoryId)) continue;
    const key = bucketFor(scheme, s.catBucket ?? "needs");
    const b = buckets.find((x) => x.key === key);
    if (b) b.actual += Number(s.total);
  }

  const today = todayISO();
  const isCurrent = monthStart(today) === month;
  const days = daysInMonth(month);
  const day = isCurrent ? dayOf(today) : today > end ? days : 0;
  const payday = isCurrent ? nextPayday(user.paydayRule, user.paydayDay, today, user.paydayWeekend as WeekendShift) : null;
  const daysLeft = payday ? Math.max(1, diffDays(today, payday)) : 0;

  const spendBuckets = buckets.filter((b) => b.key !== "savings");
  const spendTarget = spendBuckets.reduce((s, b) => s + b.target, 0);
  const spent = spendBuckets.reduce((s, b) => s + b.actual, 0);
  const savings = buckets.find((b) => b.key === "savings");
  const left = spendTarget - spent;
  const safeToday = isCurrent ? Math.max(0, Math.floor(left / daysLeft)) : 0;

  const totalPlanned = lines.reduce((s, l) => s + l.planned, 0);
  const totalActual = buckets.reduce((s, b) => s + b.actual, 0);

  return {
    month: m,
    scheme,
    lines,
    buckets,
    income: m.incomeMinor,
    extraIncome: Number(incomeRows[0]?.total ?? 0),
    isCurrent,
    day,
    days,
    payday,
    daysLeft,
    spent,
    spendTarget,
    left,
    safeToday,
    saved: savings?.actual ?? 0,
    savingsTarget: savings?.target ?? 0,
    totalPlanned,
    totalActual,
    unassigned: m.incomeMinor - totalPlanned,
    doneCount: lines.filter((l) => l.done).length,
  };
}

/** "ahead of pace" when a bucket's spend share runs >5 points ahead of the month's elapsed share. */
export function paceOf(actual: number, target: number, day: number, days: number) {
  if (target <= 0) return actual > 0 ? "over" : "ok";
  if (actual > target) return "over";
  if (day > 0 && actual / target > day / days + 0.05) return "ahead";
  return "ok";
}

export type Cut = {
  kind: "move" | "limit";
  title: string;
  detail: string;
  saves: number;
  fromLineId?: string;
  toLineId?: string;
  icon: string;
};

/** Ways to finish the month on plan: cover overspends from untouched lines, then cap runaway wants. */
export function cutSuggestions(v: MonthView): Cut[] {
  const cuts: Cut[] = [];
  const over = v.lines.filter((l) => l.actual > l.planned).sort((a, b) => b.actual - b.planned - (a.actual - a.planned));
  const donors = v.lines
    .filter((l) => l.bucket !== "savings" && !l.fixed && l.actual === 0 && l.planned > 0)
    .sort((a, b) => b.planned - a.planned);
  const used = new Map<string, number>();

  for (const o of over) {
    const gap = o.actual - o.planned;
    const donor = donors.find((d) => d.id !== o.id && d.planned - (used.get(d.id) ?? 0) >= gap);
    if (donor) {
      used.set(donor.id, (used.get(donor.id) ?? 0) + gap);
      cuts.push({
        kind: "move",
        title: `Cover ${o.name} from ${donor.name}`,
        detail: `${o.name} is GH₵ ${Math.round(gap / 100)} over. ${donor.name} has GH₵ ${Math.round((donor.planned - (used.get(donor.id) ?? 0) + gap) / 100)} unused.`,
        saves: gap,
        fromLineId: donor.id,
        toLineId: o.id,
        icon: "scissors",
      });
    }
  }

  if (v.isCurrent && v.day > 0) {
    for (const l of v.lines) {
      if (l.bucket === "savings" || l.fixed || l.actual === 0 || l.actual > l.planned) continue;
      const projected = Math.round((l.actual / v.day) * v.days);
      const overBy = projected - l.planned;
      if (overBy > 2000) {
        cuts.push({
          kind: "limit",
          title: `Keep ${l.name} under ${Math.round((l.planned - l.actual) / 100)}`,
          detail: `At this pace ${l.name} ends near GH₵ ${Math.round(projected / 100)} against a plan of ${Math.round(l.planned / 100)}.`,
          saves: overBy,
          icon: l.icon,
        });
      }
    }
  }
  return cuts.slice(0, 4);
}
