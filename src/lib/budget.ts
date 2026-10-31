import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  budgetLines,
  budgetPeriods,
  categories,
  fixedExpenses,
  incomes,
  transactions,
  type Scheme,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { DEFAULT_CATEGORIES, STARTER_SPLIT } from "@/lib/categories";
import {
  addDays,
  cycleBounds,
  cycleEndFrom,
  diffDays,
  fmtCycle,
  occurrencesInRange,
  todayISO,
  type CycleConfig,
  type WeekendShift,
} from "@/lib/dates";
import { DEFAULT_SCHEME, bucketFor } from "@/lib/schemes";

export async function ensureCategories(userId: string) {
  await db
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map((c) => ({ userId, name: c.name, bucket: c.bucket, icon: c.icon, kind: c.kind ?? "expense" })))
    .onConflictDoNothing();
}

/**
 * Regular pay a budget is planned from. Income that varies (side work, commission, irregular allowances)
 * isn't counted in advance: it joins a cycle's budget when it's logged as income.
 */
export async function incomeTotal(userId: string) {
  const [r] = await db
    .select({ total: sql<string>`coalesce(sum(${incomes.amountMinor}), 0)` })
    .from(incomes)
    .where(and(eq(incomes.userId, userId), eq(incomes.variable, false)));
  return Number(r.total);
}

export type Period = typeof budgetPeriods.$inferSelect;

export function cycleConfig(user: SessionUser): CycleConfig {
  return {
    mode: user.budgetCycle === "payday" ? "payday" : "calendar",
    rule: user.paydayRule,
    day: user.paydayDay,
    weekend: user.paydayWeekend as WeekendShift,
  };
}

async function periodContaining(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(budgetPeriods)
    .where(and(eq(budgetPeriods.userId, userId), lte(budgetPeriods.start, date), gte(budgetPeriods.end, date)))
    .limit(1);
  return row ?? null;
}

/** Where a new cycle containing `date` should start and end, without overlapping cycles that already exist. */
async function plannedBounds(user: SessionUser, date: string) {
  let { start, end } = cycleBounds(cycleConfig(user), date);
  const [before] = await db
    .select({ end: budgetPeriods.end })
    .from(budgetPeriods)
    .where(and(eq(budgetPeriods.userId, user.id), lte(budgetPeriods.end, date)))
    .orderBy(desc(budgetPeriods.end))
    .limit(1);
  const [after] = await db
    .select({ start: budgetPeriods.start })
    .from(budgetPeriods)
    .where(and(eq(budgetPeriods.userId, user.id), gte(budgetPeriods.start, date)))
    .orderBy(asc(budgetPeriods.start))
    .limit(1);
  if (before && before.end >= start) start = addDays(before.end, 1);
  if (after && after.start <= end) end = addDays(after.start, -1);
  return { start, end };
}

/** Planned amount per category for a fixed expense in a cycle: one charge per time its day falls inside it. */
function fixedPlan(f: typeof fixedExpenses.$inferSelect, start: string, end: string) {
  const n = f.dayOfMonth == null ? 1 : occurrencesInRange(f.dayOfMonth, start, end).length;
  return f.amountMinor * n;
}

/** After a cycle's dates change, re-plan its fixed-bill lines for the new range (other lines are untouched). */
async function replanFixed(userId: string, periodId: string) {
  const [p] = await db.select().from(budgetPeriods).where(eq(budgetPeriods.id, periodId));
  if (!p) return;
  const fixed = await db
    .select()
    .from(fixedExpenses)
    .where(and(eq(fixedExpenses.userId, userId), eq(fixedExpenses.active, true)));
  const byCat = new Map<string, { amount: number; fixedId: string }>();
  for (const f of fixed) {
    const cur = byCat.get(f.categoryId);
    byCat.set(f.categoryId, { amount: (cur?.amount ?? 0) + fixedPlan(f, p.start, p.end), fixedId: cur?.fixedId ?? f.id });
  }
  for (const [categoryId, { amount, fixedId }] of byCat) {
    await db
      .insert(budgetLines)
      .values({ monthId: p.id, userId, categoryId, plannedMinor: amount, fixedExpenseId: fixedId })
      .onConflictDoUpdate({ target: [budgetLines.monthId, budgetLines.categoryId], set: { plannedMinor: amount, fixedExpenseId: fixedId } });
  }
}

/**
 * Returns the budget cycle containing `date`, creating it (and its lines) the first time it's opened.
 * Idempotent and race-safe: unique start + ON CONFLICT; creation runs as one atomic batch.
 */
export async function ensurePeriod(user: SessionUser, date: string): Promise<Period> {
  const existing = await periodContaining(user.id, date);
  if (existing) {
    await autoLogFixed(user, existing);
    return existing;
  }
  const { start, end } = await plannedBounds(user, date);
  const row = await createPeriod(user, start, end);
  await autoLogFixed(user, row);
  return row;
}

/** Creates a cycle with the given bounds: fixed bills per occurrence, other lines carried from the cycle before. */
async function createPeriod(user: SessionUser, start: string, end: string): Promise<Period> {
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
    const amount = fixedPlan(f, start, end);
    if (!amount) continue; // not due in this (short) cycle
    const cur = planned.get(f.categoryId);
    planned.set(f.categoryId, { planned: (cur?.planned ?? 0) + amount, fixedId: cur?.fixedId ?? f.id });
  }

  // Carry over variable lines from the cycle before; otherwise seed a starter split.
  const [prev] = await db
    .select()
    .from(budgetPeriods)
    .where(and(eq(budgetPeriods.userId, user.id), lte(budgetPeriods.end, addDays(start, -1))))
    .orderBy(desc(budgetPeriods.end))
    .limit(1);
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
      for (const [name, share] of STARTER_SPLIT[b.key] ?? []) {
        const c = byName.get(name);
        if (c && !planned.has(c.id)) planned.set(c.id, { planned: Math.floor((left * share) / 100) * 100, fixedId: null });
      }
    }
  }

  const periodId = crypto.randomUUID();
  try {
    const lineRows = [...planned].map(([categoryId, p]) => ({
      monthId: periodId,
      userId: user.id,
      categoryId,
      plannedMinor: p.planned,
      fixedExpenseId: p.fixedId,
    }));
    const ops = [
      db.insert(budgetPeriods).values({ id: periodId, userId: user.id, start, end, scheme, incomeMinor: income }),
      ...(lineRows.length ? [db.insert(budgetLines).values(lineRows)] : []),
    ] as const;
    await db.batch(ops as unknown as Parameters<typeof db.batch>[0]);
  } catch (e) {
    // Lost a race with a parallel request that created the cycle first; fall through and read it.
    if (!String(e).includes("budget_months_user_month_uq")) throw e;
  }
  return (await periodContaining(user.id, start))!;
}

/** Logs fixed expenses whose day has arrived in the current cycle (once per occurrence). */
async function autoLogFixed(user: SessionUser, period: Period) {
  const today = todayISO();
  if (!user.settings.autoAddFixed || today < period.start || today > period.end) return;
  const already = new Set(period.loggedFixed ?? []);
  const fixed = await db
    .select()
    .from(fixedExpenses)
    .where(and(eq(fixedExpenses.userId, user.id), eq(fixedExpenses.active, true)));
  const due = fixed.flatMap((f) =>
    occurrencesInRange(f.dayOfMonth, period.start, today)
      // Older rows stored a bare id for "logged this calendar month".
      .filter((d) => !already.has(`${f.id}:${d}`) && !(already.has(f.id) && d.slice(0, 7) === period.start.slice(0, 7)))
      .map((d) => ({ f, d })),
  );
  if (!due.length) return;
  // Record first, so an entry the user deletes later isn't logged again.
  await db
    .update(budgetPeriods)
    .set({ loggedFixed: sql`${budgetPeriods.loggedFixed} || ${JSON.stringify(due.map(({ f, d }) => `${f.id}:${d}`))}::jsonb` })
    .where(eq(budgetPeriods.id, period.id));
  const inserted = await db
    .insert(transactions)
    .values(
      due.map(({ f, d }) => ({
        userId: user.id,
        kind: "expense",
        amountMinor: f.amountMinor,
        categoryId: f.categoryId,
        name: f.name,
        method: "bank",
        occurredOn: d,
        source: "fixed",
        fixedExpenseId: f.id,
        dedupeKey: `fixed:${f.id}:${d.slice(0, 7)}`,
      })),
    )
    .onConflictDoNothing()
    .returning({ categoryId: transactions.categoryId });
  const catIds = inserted.map((r) => r.categoryId!).filter(Boolean);
  if (catIds.length) {
    await db
      .update(budgetLines)
      .set({ done: true })
      .where(and(eq(budgetLines.monthId, period.id), inArray(budgetLines.categoryId, catIds)));
  }
}

/**
 * "I've been paid" on `date`. Late in the cycle, it's next cycle's pay arriving early: the current cycle
 * ends the day before and a new one starts (running to the payday after the one it replaces).
 * Early in the cycle, it's this cycle's pay (on time or late): the cycle starts on that day.
 */
export async function recordPay(user: SessionUser, date: string, amountMinor: number) {
  const cfg = cycleConfig(user);
  const cur = await ensurePeriod(user, date);
  const length = diffDays(cur.start, cur.end) + 1;
  const intoCycle = diffDays(cur.start, date);

  if (cfg.mode === "payday" && date > cur.start && intoCycle >= length / 2) {
    // Early pay for the next cycle.
    const replaced = addDays(cur.end, 1);
    const [next] = await db
      .select()
      .from(budgetPeriods)
      .where(and(eq(budgetPeriods.userId, user.id), eq(budgetPeriods.start, replaced)));
    await db.update(budgetPeriods).set({ end: addDays(date, -1) }).where(eq(budgetPeriods.id, cur.id));
    await replanFixed(user.id, cur.id);
    if (next) {
      await db.update(budgetPeriods).set({ start: date, paidOn: date, incomeMinor: amountMinor }).where(eq(budgetPeriods.id, next.id));
      await replanFixed(user.id, next.id);
      return { ...next, start: date };
    }
    const end = cycleEndFrom(cfg, date, replaced);
    // Make sure nothing already starts inside the new cycle's range.
    const [clash] = await db
      .select({ start: budgetPeriods.start })
      .from(budgetPeriods)
      .where(and(eq(budgetPeriods.userId, user.id), gte(budgetPeriods.start, date), lte(budgetPeriods.start, end)))
      .limit(1);
    const created = await createPeriod(user, date, clash ? addDays(clash.start, -1) : end);
    await db.update(budgetPeriods).set({ paidOn: date, incomeMinor: amountMinor }).where(eq(budgetPeriods.id, created.id));
    return created;
  }

  if (cfg.mode === "payday" && date > cur.start) {
    // This cycle's pay came late: the cycle starts when it landed; the previous one runs until then.
    const [prev] = await db
      .select()
      .from(budgetPeriods)
      .where(and(eq(budgetPeriods.userId, user.id), eq(budgetPeriods.end, addDays(cur.start, -1))));
    if (prev) {
      await db.update(budgetPeriods).set({ end: addDays(date, -1) }).where(eq(budgetPeriods.id, prev.id));
      await replanFixed(user.id, prev.id);
    }
    await db.update(budgetPeriods).set({ start: date, paidOn: date, incomeMinor: amountMinor }).where(eq(budgetPeriods.id, cur.id));
    await replanFixed(user.id, cur.id);
    return { ...cur, start: date };
  }

  await db.update(budgetPeriods).set({ paidOn: date, incomeMinor: amountMinor }).where(eq(budgetPeriods.id, cur.id));
  return cur;
}

/** After switching between payday and calendar cycles, reshape the current cycle to the new rule. */
export async function reshapeCurrentPeriod(user: SessionUser) {
  const today = todayISO();
  const cur = await periodContaining(user.id, today);
  if (!cur) return;
  const { start, end } = cycleBounds(cycleConfig(user), today);
  // Never reach back over a cycle that's already closed with pay recorded.
  const [prev] = await db
    .select()
    .from(budgetPeriods)
    .where(and(eq(budgetPeriods.userId, user.id), lte(budgetPeriods.end, addDays(cur.start, -1))))
    .orderBy(desc(budgetPeriods.end))
    .limit(1);
  let newStart = start;
  if (prev && prev.start >= newStart) newStart = cur.start; // would swallow the previous cycle entirely: keep start
  if (prev && newStart <= prev.end && newStart > prev.start) {
    await db.update(budgetPeriods).set({ end: addDays(newStart, -1) }).where(eq(budgetPeriods.id, prev.id));
    await replanFixed(user.id, prev.id);
  }
  // Drop any future cycles that the new shape now overlaps.
  await db
    .delete(budgetPeriods)
    .where(and(eq(budgetPeriods.userId, user.id), gte(budgetPeriods.start, addDays(cur.start, 1)), lte(budgetPeriods.start, end)));
  await db.update(budgetPeriods).set({ start: newStart, end }).where(eq(budgetPeriods.id, cur.id));
  await replanFixed(user.id, cur.id);
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

export type PeriodView = Awaited<ReturnType<typeof getPeriodView>>;

/** Per-request memoised view of the cycle containing `date` (layout and page share one computation). */
export const periodView = cache((user: SessionUser, date: string) => getPeriodView(user, date));

export async function getPeriodView(user: SessionUser, date: string) {
  await ensureCategories(user.id);
  const m = await ensurePeriod(user, date);
  const start = m.start;
  const end = m.end;

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
          gte(transactions.occurredOn, start),
          lte(transactions.occurredOn, end),
        ),
      )
      .groupBy(transactions.categoryId, categories.bucket),
    // Extra income received in this cycle (anything except regular salary, which "I've been paid" records).
    db
      .select({ total: sql<string>`coalesce(sum(${transactions.amountMinor}), 0)` })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(
        and(
          eq(transactions.userId, user.id),
          eq(transactions.kind, "income"),
          sql`coalesce(${categories.name}, '') <> 'Salary'`,
          gte(transactions.occurredOn, start),
          lte(transactions.occurredOn, end),
        ),
      ),
  ]);

  const extraIncome = Number(incomeRows[0]?.total ?? 0);
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
    // Pay plus any extra income received this cycle, split by the scheme.
    target: Math.round(((m.incomeMinor + extraIncome) * b.pct) / 100),
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
  const isCurrent = start <= today && today <= end;
  const days = diffDays(start, end) + 1;
  const day = isCurrent ? diffDays(start, today) + 1 : today > end ? days : 0;
  // Next payday as the plan stands (the day after this cycle ends).
  const payday = isCurrent ? addDays(end, 1) : null;
  const daysLeft = isCurrent ? diffDays(today, end) + 1 : 0;

  const spendBuckets = buckets.filter((b) => b.key !== "savings");
  const spendTarget = spendBuckets.reduce((s, b) => s + b.target, 0);
  const spent = spendBuckets.reduce((s, b) => s + b.actual, 0);
  const savings = buckets.find((b) => b.key === "savings");
  const left = spendTarget - spent;
  const safeToday = isCurrent ? Math.max(0, Math.floor(left / daysLeft)) : 0;

  const totalPlanned = lines.reduce((s, l) => s + l.planned, 0);
  const totalActual = buckets.reduce((s, b) => s + b.actual, 0);

  return {
    period: { ...m, label: fmtCycle(start, end) },
    scheme,
    lines,
    buckets,
    income: m.incomeMinor,
    extraIncome,
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
    unassigned: m.incomeMinor + extraIncome - totalPlanned,
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
export function cutSuggestions(v: PeriodView): Cut[] {
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
