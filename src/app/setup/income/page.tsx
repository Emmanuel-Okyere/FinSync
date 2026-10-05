import { eq } from "drizzle-orm";
import { db } from "@/db";
import { incomes } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { toInputValue } from "@/lib/money";
import { payslipDeductionRows, payslipItems } from "@/lib/payslip-form";
import { IncomeForm } from "@/components/setup/IncomeForm";
import { saveIncome } from "../actions";
import { StepHead } from "../steps";

export const metadata = { title: "Setup: income · FinSync" };

export default async function SetupIncome() {
  const user = await requireUser();
  const rows = await db.select().from(incomes).where(eq(incomes.userId, user.id)).orderBy(incomes.createdAt);
  const main = rows.find((r) => !r.variable);
  return (
    <>
      <StepHead n={1} title="What do you take home each month?" lead="After tax and SSNIT. A rough number is fine. You can change it any time." />
      <IncomeForm
        action={saveIncome}
        initial={{
          main: main ? toInputValue(main.amountMinor).replace(/\.00$/, "") : "",
          kind: main?.kind ?? "salary",
          payday: user.paydayRule,
          paydayDay: user.paydayDay,
          paydayWeekend: user.paydayWeekend,
          payslip: main?.payslip ? { basic: toInputValue(main.payslip.basic), tier3Pct: main.payslip.tier3Pct ? String(main.payslip.tier3Pct) : "", items: payslipItems(main.payslip).map((a) => ({ name: a.name ?? "", amount: toInputValue(a.amount), per: a.per })), deductions: payslipDeductionRows(main.payslip), taxableBenefits: main.payslip.taxableBenefits ? toInputValue(main.payslip.taxableBenefits) : "" } : null,
          extras: rows.filter((r) => r.variable).map((r) => ({ name: r.name, amount: toInputValue(r.amountMinor).replace(/\.00$/, "") })),
        }}
      />
    </>
  );
}
