import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { incomes } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { toInputValue } from "@/lib/money";
import { PageHead } from "@/components/app/PageHead";
import { TaxCalculator } from "@/components/app/TaxCalculator";

export const metadata = { title: "Tax calculator · FinSync" };

export default async function Tax() {
  const user = await requireOnboardedUser();
  const [main] = await db
    .select()
    .from(incomes)
    .where(and(eq(incomes.userId, user.id), eq(incomes.variable, false)))
    .orderBy(asc(incomes.createdAt))
    .limit(1);
  const ps = main?.payslip;
  return (
    <>
      <PageHead title="Tax calculator" sub="PAYE and SSNIT from your gross pay" add={false} search={false} />
      <TaxCalculator
        today={todayISO()}
        initial={{
          basic: ps ? toInputValue(ps.basic) : "",
          allowances: ps?.allowances ? toInputValue(ps.allowances) : "",
          tier3Pct: ps?.tier3Pct ? String(ps.tier3Pct) : "",
        }}
      />
    </>
  );
}
