"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { incomes } from "@/db/schema";
import { FormState, UserError, run } from "@/lib/action";
import { actionUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { parsePayslipForm } from "@/lib/payslip-form";

/** Saves the average monthly take-home (basic, allowances at their frequencies, Tier 3) as the main income. Bonus/overtime are one-offs. */
export async function saveTakeHomeFromGross(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const { payslip, net } = parsePayslipForm(fd, todayISO());
    if (net <= 0) throw new UserError("That leaves nothing to take home.");

    const [main] = await db
      .select()
      .from(incomes)
      .where(and(eq(incomes.userId, user.id), eq(incomes.variable, false)))
      .orderBy(incomes.createdAt)
      .limit(1);
    if (main) {
      await db.update(incomes).set({ amountMinor: net, kind: "salary", payslip }).where(eq(incomes.id, main.id));
    } else {
      await db.insert(incomes).values({ userId: user.id, name: "Salary", kind: "salary", amountMinor: net, variable: false, payslip });
    }
    return `Saved GH₵ ${cedis(net, 2)} as your monthly take-home. New months plan from it; this month keeps its numbers.`;
  });
}
