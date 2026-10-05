import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { investmentEntries, investments } from "@/db/schema";

type Entry = typeof investmentEntries.$inferSelect;

/** Value = latest valuation plus contributions made after it. */
export function summarise(entries: Entry[]) {
  const sorted = [...entries].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.getTime() - b.createdAt.getTime());
  let value = 0;
  let invested = 0;
  let units: number | null = null;
  const series: { date: string; value: number }[] = [];
  for (const e of sorted) {
    if (e.kind === "contribution") {
      invested += e.amountMinor;
      value += e.amountMinor;
      if (e.units) units = (units ?? 0) + Number(e.units);
    } else {
      value = e.amountMinor;
      if (e.units) units = Number(e.units);
    }
    series.push({ date: e.occurredOn, value });
  }
  const growth = value - invested;
  return { value, invested, growth, pct: invested ? (growth / invested) * 100 : 0, units, series };
}

export async function portfolio(userId: string) {
  const invs = await db.select().from(investments).where(eq(investments.userId, userId)).orderBy(asc(investments.createdAt));
  const entries = invs.length ? await db.select().from(investmentEntries).where(inArray(investmentEntries.investmentId, invs.map((i) => i.id))) : [];
  const rows = invs.map((inv) => ({ inv, entries: entries.filter((e) => e.investmentId === inv.id), ...summarise(entries.filter((e) => e.investmentId === inv.id)) }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const invested = rows.reduce((s, r) => s + r.invested, 0);
  // Portfolio series: total value at each entry date.
  const dates = [...new Set(entries.map((e) => e.occurredOn))].sort();
  const series = dates.map((d) => rows.reduce((s, r) => s + (summarise(r.entries.filter((e) => e.occurredOn <= d)).value), 0));
  return { rows, total, invested, growth: total - invested, series };
}

export const KIND_LABEL: Record<string, string> = { pension: "Pension", fund: "Funds", deposit: "Deposits", stocks: "Stocks", other: "Other" };
