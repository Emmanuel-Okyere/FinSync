"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { incomes } from "@/db/schema";
import { FormState, UserError, run } from "@/lib/action";
import { actionUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { cedis, parseMoney } from "@/lib/money";
import { calculatePay } from "@/lib/paye";

/** Saves the regular monthly take-home (basic + allowances + Tier 3) as the main income. Bonus/overtime are one-offs. */
export async function saveTakeHomeFromGross(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const basic = parseMoney(String(fd.get("basic") ?? ""));
    const allowances = parseMoney(String(fd.get("allowances") ?? "") || "0");
    const tier3Pct = Number(String(fd.get("tier3Pct") ?? "").trim() || "0");
    if (basic == null || basic <= 0) throw new UserError("Enter your basic salary first.");
    if (allowances == null) throw new UserError("Allowances: enter a number like 500");
    if (!Number.isFinite(tier3Pct) || tier3Pct < 0 || tier3Pct > 50) throw new UserError("Tier 3: enter a percentage between 0 and 50");
    const payslip = { basic, allowances, tier3Pct };
    const net = calculatePay({ ...payslip, date: todayISO() }).net;
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
