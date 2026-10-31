import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, householdMembers, insurancePolicies, savingsAccounts } from "@/db/schema";
import { accountMethod, userAccounts } from "@/lib/accounts";
import type { PayAccount } from "@/lib/paid-with";
import type { SessionUser } from "@/lib/auth/session";
import type { PeriodView } from "@/lib/budget";
import { bucketFor } from "@/lib/schemes";

/** Everything the Add entry sheet needs, shaped for the client. */
export async function entryData(user: SessionUser, v: PeriodView) {
  const [cats, policies, member, accts, savings, memory] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.userId, user.id), eq(categories.archived, false))).orderBy(categories.name),
    db.select({ id: insurancePolicies.id, name: insurancePolicies.name }).from(insurancePolicies).where(eq(insurancePolicies.userId, user.id)),
    db.select().from(householdMembers).where(eq(householdMembers.userId, user.id)),
    userAccounts(user.id),
    db.select({ id: savingsAccounts.id, name: savingsAccounts.name }).from(savingsAccounts).where(eq(savingsAccounts.userId, user.id)),
    // Last automatic saving per account and payment category, so the form starts from it.
    db.execute<{ account_id: string; category_id: string; amount_minor: string }>(sql`
      select distinct on (s.account_id, p.category_id) s.account_id, p.category_id, s.amount_minor
      from transactions s join transactions p on p.id = s.save_for_id
      where s.user_id = ${user.id} and s.source = 'autosave' and s.account_id is not null and p.category_id is not null
      order by s.account_id, p.category_id, s.occurred_on desc, s.created_at desc`),
  ]);
  const savingsName = new Map(savings.map((x) => [x.id, x.name]));
  const accounts: PayAccount[] = accts.map((a) => ({
    id: a.id,
    name: a.name,
    method: accountMethod(a),
    fee: a.fee ?? null,
    save: a.saveToId && a.saveMinor > 0 && savingsName.has(a.saveToId) ? { amount: a.saveMinor, to: savingsName.get(a.saveToId)!, except: a.saveExcept } : null,
  }));
  const memRows = "rows" in memory ? memory.rows : (memory as unknown as { account_id: string; category_id: string; amount_minor: string }[]);
  const saveMemory = Object.fromEntries(memRows.map((r) => [`${r.account_id}:${r.category_id}`, Number(r.amount_minor)]));
  const lineByCat = new Map(v.lines.map((l) => [l.categoryId, l]));
  // Most-used first: categories with a budget line lead.
  const sorted = [...cats].sort((a, b) => Number(lineByCat.has(b.id)) - Number(lineByCat.has(a.id)));
  return {
    cats: sorted.map((c) => {
      const key = c.kind === "income" ? "income" : bucketFor(v.scheme, c.bucket);
      const l = lineByCat.get(c.id);
      return {
        id: c.id,
        name: c.name,
        icon: c.icon,
        kind: c.kind,
        bucket: key,
        bucketName: c.kind === "income" ? "Income" : (v.scheme.buckets.find((b) => b.key === key)?.name ?? key),
        planned: l?.planned,
        actual: l?.actual,
      };
    }),
    policies,
    inHousehold: member.length > 0,
    accounts,
    saveMemory,
  };
}
