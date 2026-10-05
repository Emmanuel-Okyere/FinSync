import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, householdMembers, insurancePolicies } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import type { MonthView } from "@/lib/budget";
import { bucketFor } from "@/lib/schemes";

/** Everything the Add entry sheet needs, shaped for the client. */
export async function entryData(user: SessionUser, v: MonthView) {
  const [cats, policies, member] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.userId, user.id), eq(categories.archived, false))).orderBy(categories.name),
    db.select({ id: insurancePolicies.id, name: insurancePolicies.name }).from(insurancePolicies).where(eq(insurancePolicies.userId, user.id)),
    db.select().from(householdMembers).where(eq(householdMembers.userId, user.id)),
  ]);
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
  };
}
