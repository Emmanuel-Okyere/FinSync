import "server-only";
import { and, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";

export const txSelect = {
  id: transactions.id,
  kind: transactions.kind,
  amountMinor: transactions.amountMinor,
  name: transactions.name,
  note: transactions.note,
  method: transactions.method,
  occurredOn: transactions.occurredOn,
  categoryId: transactions.categoryId,
  catName: categories.name,
  catIcon: categories.icon,
  catBucket: categories.bucket,
  // Linked transfer charge on this payment (charges themselves are listed only in exports).
  feeMinor: sql<number>`coalesce((select f.amount_minor from transactions f where f.fee_for_id = ${transactions.id} limit 1), 0)::int`,
};

/** Escapes LIKE wildcards so user search text is matched literally. */
export function likeEscape(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listTransactions(
  userId: string,
  opts: { from?: string; to?: string; q?: string; kind?: "income" | "expense"; bucket?: string; method?: string; categoryId?: string; minAmount?: number; limit?: number; offset?: number; includeCharges?: boolean } = {},
) {
  const where: SQL[] = [eq(transactions.userId, userId)];
  // Charges show under their parent payment, unless asked for (export) or browsing the charges category.
  if (!opts.includeCharges && !opts.categoryId) where.push(isNull(transactions.feeForId));
  if (opts.from) where.push(gte(transactions.occurredOn, opts.from));
  if (opts.to) where.push(lte(transactions.occurredOn, opts.to));
  if (opts.kind) where.push(eq(transactions.kind, opts.kind));
  if (opts.bucket) where.push(eq(categories.bucket, opts.bucket));
  if (opts.method) where.push(eq(transactions.method, opts.method));
  if (opts.categoryId) where.push(eq(transactions.categoryId, opts.categoryId));
  if (opts.minAmount) where.push(gte(transactions.amountMinor, opts.minAmount));
  if (opts.q) {
    const term = `%${likeEscape(opts.q)}%`;
    const amt = /^\d+(\.\d{1,2})?$/.test(opts.q) ? Math.round(Number(opts.q) * 100) : null;
    where.push(
      or(
        ilike(transactions.name, term),
        ilike(transactions.note, term),
        ilike(categories.name, term),
        ...(amt != null ? [eq(transactions.amountMinor, amt)] : []),
      )!,
    );
  }
  return db
    .select(txSelect)
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(...where))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);
}

export async function monthlyTotals(userId: string, from: string, to: string) {
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`,
      kind: transactions.kind,
      total: sql<string>`sum(${transactions.amountMinor})`,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.occurredOn, from), lte(transactions.occurredOn, to)))
    .groupBy(sql`1`, transactions.kind);
  return rows.map((r) => ({ month: r.month, kind: r.kind, total: Number(r.total) }));
}

/** Spend per day across [start, end] (expense entries, savings categories excluded); index 0 = start. */
export async function dailySpend(userId: string, start: string, end: string) {
  const rows = await db
    .select({ offset: sql<number>`(${transactions.occurredOn} - ${start}::date)::int`, total: sql<string>`sum(${transactions.amountMinor})` })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.kind, "expense"),
        gte(transactions.occurredOn, start),
        lte(transactions.occurredOn, end),
        sql`coalesce(${categories.bucket}, 'needs') <> 'savings'`,
      ),
    )
    .groupBy(sql`1`);
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  const out = new Array(Math.max(1, days)).fill(0) as number[];
  for (const r of rows) if (r.offset >= 0 && r.offset < out.length) out[r.offset] = Number(r.total);
  return out;
}
