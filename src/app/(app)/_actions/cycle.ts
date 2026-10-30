"use server";

import { z } from "zod";
import { FormState, UserError, formObject, run, zDate, zMoney } from "@/lib/action";
import { actionUser } from "@/lib/auth/session";
import { recordPay } from "@/lib/budget";
import { addDays, fmtCycle, todayISO } from "@/lib/dates";

/** "I've been paid": confirms pay and, in payday mode, starts or shifts the budget cycle. */
export async function iveBeenPaid(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const d = z.object({ date: zDate, amount: zMoney("Amount received") }).parse(formObject(fd));
    const today = todayISO();
    if (d.date > today) throw new UserError("That date is in the future.", "date");
    if (d.date < addDays(today, -40)) throw new UserError("Pick a date in the last few weeks.", "date");
    if (d.amount <= 0) throw new UserError("Enter what you received.", "amount");
    const p = await recordPay(user, d.date, d.amount);
    return user.budgetCycle === "payday" ? `Paid. Your budget now runs ${fmtCycle(p.start, p.end)}` : "Pay recorded";
  });
}
