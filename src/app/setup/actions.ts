"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { budgetMonths, categories, fixedExpenses, incomes, users, type PayslipInput } from "@/db/schema";
import { parsePayslipForm } from "@/lib/payslip-form";
import { flash } from "@/lib/flash";
import { FormState, UserError, run } from "@/lib/action";
import { actionUser } from "@/lib/auth/session";
import { ensureCategories } from "@/lib/budget";
import { monthStart, todayISO } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { parseSchemeForm } from "@/lib/scheme-form";

const PAYDAY = z.enum(["25th", "last_working_day", "weekly", "date"]);
const KIND = z.enum(["salary", "business", "allowance", "other"]);

export async function saveIncome(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const kind = KIND.parse(fd.get("kind") ?? "salary");
    let main = parseMoney(String(fd.get("main") ?? ""));
    let payslip: PayslipInput | null = null;
    if (fd.get("mode") === "gross" && kind === "salary") {
      // Never trust the browser's figure: recompute take-home from the gross inputs.
      const r = parsePayslipForm(fd, todayISO());
      payslip = r.payslip;
      main = r.net;
    }
    if (main == null || main <= 0) throw new UserError("Enter your take-home pay, like 5800", "main");
    const payday = PAYDAY.parse(fd.get("payday") ?? "last_working_day");
    const paydayDay = payday === "date" ? z.coerce.number().int().min(1).max(31).parse(fd.get("paydayDay")) : null;
    const paydayWeekend = z.enum(["before", "after", "same"]).catch("before").parse(fd.get("paydayWeekend"));

    const names = fd.getAll("extraName").map(String);
    const amounts = fd.getAll("extraAmount").map(String);
    if (names.length > 10) throw new UserError("Add at most 10 incomes.");
    const extras = names
      .map((n, i) => ({ name: n.trim().slice(0, 60), amount: parseMoney(amounts[i] ?? "") }))
      .filter((x) => x.name || x.amount);
    for (const x of extras) {
      if (!x.name) throw new UserError("Give each extra income a name.");
      if (x.amount == null || x.amount <= 0) throw new UserError(`Enter an amount for ${x.name}.`);
    }

    const mainName = { salary: "Salary", business: "Business", allowance: "Allowance", other: "Main income" }[kind];
    await db.batch([
      db.delete(incomes).where(eq(incomes.userId, user.id)),
      db.insert(incomes).values([
        { userId: user.id, name: mainName, kind, amountMinor: main, variable: false, payslip },
        ...extras.map((x) => ({ userId: user.id, name: x.name, kind: "other", amountMinor: x.amount!, variable: true })),
      ]),
      db.update(users).set({ paydayRule: payday, paydayDay, paydayWeekend, updatedAt: new Date() }).where(eq(users.id, user.id)),
    ]);
    if (fd.get("returnTo") === "settings") return "Income saved";
    await flash("Income saved");
    redirect("/setup/scheme");
  });
}

export async function saveScheme(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    const scheme = parseSchemeForm(fd);
    await db.update(users).set({ scheme, updatedAt: new Date() }).where(eq(users.id, user.id));
    await flash(`${scheme.name} it is`);
    redirect("/setup/fixed");
  });
}

export async function saveFixed(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const user = await actionUser();
    await ensureCategories(user.id);
    const cats = await db.select().from(categories).where(eq(categories.userId, user.id));
    const byId = new Map(cats.map((c) => [c.id, c]));

    const names = fd.getAll("name").map(String);
    const catIds = fd.getAll("categoryId").map(String);
    const amounts = fd.getAll("amount").map(String);
    const days = fd.getAll("day").map(String);
    const on = new Set(fd.getAll("on").map(String));
    if (names.length > 40) throw new UserError("That's a lot of fixed costs. Add at most 40.");

    const rows = [];
    for (let i = 0; i < names.length; i++) {
      if (!on.has(String(i))) continue;
      const name = names[i].trim().slice(0, 60);
      const cat = byId.get(catIds[i]);
      const amt = parseMoney(amounts[i]);
      const day = days[i] ? Number(days[i]) : null;
      if (!name || !cat) throw new UserError("Each fixed expense needs a name and a category.");
      if (amt == null || amt <= 0) throw new UserError(`Enter an amount for ${name}.`);
      if (day != null && !(Number.isInteger(day) && day >= 1 && day <= 31)) throw new UserError(`Pick a day between 1 and 31 for ${name}.`);
      rows.push({ userId: user.id, categoryId: cat.id, name, amountMinor: amt, dayOfMonth: day });
    }

    const month = monthStart(todayISO());
    await db.batch([
      db.delete(fixedExpenses).where(eq(fixedExpenses.userId, user.id)),
      ...(rows.length ? [db.insert(fixedExpenses).values(rows)] : []),
      // Rebuild this month's plan from the new setup on next open.
      db.delete(budgetMonths).where(and(eq(budgetMonths.userId, user.id), eq(budgetMonths.month, month))),
      db.update(users).set({ onboardedAt: user.onboardedAt ?? new Date(), updatedAt: new Date() }).where(eq(users.id, user.id)),
    ] as unknown as Parameters<typeof db.batch>[0]);
    await flash("You're all set. Here's your month.");
    redirect("/home");
  });
}

export async function finishLater() {
  const user = await actionUser();
  await db.update(users).set({ onboardedAt: user.onboardedAt ?? new Date() }).where(eq(users.id, user.id));
  await flash("Saved. You can finish setup any time in Settings.");
  redirect("/home");
}
