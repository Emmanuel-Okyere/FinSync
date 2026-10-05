import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, fixedExpenses } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { ensureCategories, incomeTotal } from "@/lib/budget";
import { SUGGESTED_FIXED } from "@/lib/categories";
import { toInputValue } from "@/lib/money";
import { DEFAULT_SCHEME } from "@/lib/schemes";
import { FixedForm } from "@/components/setup/FixedForm";
import { saveFixed } from "../actions";
import { StepHead } from "../steps";

export const metadata = { title: "Setup: fixed expenses · FinSync" };

export default async function SetupFixed() {
  const user = await requireUser();
  await ensureCategories(user.id);
  const [cats, existing, income] = await Promise.all([
    db.select().from(categories).where(and(eq(categories.userId, user.id), eq(categories.kind, "expense"), eq(categories.archived, false))).orderBy(categories.name),
    db.select().from(fixedExpenses).where(eq(fixedExpenses.userId, user.id)).orderBy(fixedExpenses.createdAt),
    incomeTotal(user.id),
  ]);
  const byName = new Map(cats.map((c) => [c.name, c.id]));
  const initial = existing.length
    ? existing.map((f) => ({ name: f.name, categoryId: f.categoryId, amount: toInputValue(f.amountMinor).replace(/\.00$/, ""), day: f.dayOfMonth ? String(f.dayOfMonth) : "", on: f.active }))
    : SUGGESTED_FIXED.map((f) => ({ name: f.name, categoryId: byName.get(f.category) ?? cats[0].id, amount: String(f.amount), day: f.day ? String(f.day) : "", on: f.on }));
  const scheme = user.scheme ?? DEFAULT_SCHEME;
  return (
    <>
      <StepHead n={3} title="What do you pay every month?" lead="We filled in common ones. Switch off what you don't pay and fix the amounts. We'll add these to your budget on the 1st, so you never type them again." />
      <FixedForm
        action={saveFixed}
        cats={cats.map((c) => ({ id: c.id, name: c.name, bucket: c.bucket, icon: c.icon }))}
        initial={initial}
        income={income}
        buckets={scheme.buckets}
        submitLabel="Finish and open dashboard"
      />
    </>
  );
}
