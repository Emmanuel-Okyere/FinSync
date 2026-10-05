import "server-only";
import type { PayslipInput } from "@/db/schema";
import { UserError } from "@/lib/action";
import { parseMoney } from "@/lib/money";
import { monthlyEquivalent, yearOfPay, type AllowanceFrequency, type AllowanceItem } from "@/lib/paye";

const FREQS: AllowanceFrequency[] = ["month", "quarter", "year"];

/** Reads basic + allowance rows + Tier 3 from a form and recomputes take-home on the server. */
export function parsePayslipForm(fd: FormData, today: string): { payslip: PayslipInput; net: number } {
  const basic = parseMoney(String(fd.get("basic") ?? ""));
  if (basic == null || basic <= 0) throw new UserError("Enter your basic salary, like 6000");

  const names = fd.getAll("allowanceName").map((v) => String(v).trim().slice(0, 40));
  const amounts = fd.getAll("allowanceAmount").map(String);
  const pers = fd.getAll("allowancePer").map(String);
  if (amounts.length > 15) throw new UserError("Add at most 15 allowances.");
  const items: AllowanceItem[] = [];
  amounts.forEach((raw, i) => {
    if (!raw.trim()) return; // empty row
    const amount = parseMoney(raw);
    const label = names[i] || `Allowance ${i + 1}`;
    if (amount == null) throw new UserError(`${label}: enter an amount like 500`);
    const per = pers[i] as AllowanceFrequency;
    if (!FREQS.includes(per)) throw new UserError(`${label}: choose how often it's paid`);
    if (amount > 0) items.push({ ...(names[i] ? { name: names[i] } : {}), amount, per });
  });

  const tier3Pct = Number(String(fd.get("tier3Pct") ?? "").trim() || "0");
  if (!Number.isFinite(tier3Pct) || tier3Pct < 0 || tier3Pct > 50) throw new UserError("Tier 3: enter a percentage between 0 and 50");

  const year = yearOfPay({ basic, items, tier3Pct, date: today });
  return { payslip: { basic, allowances: monthlyEquivalent(items), tier3Pct, items }, net: year.averageNet };
}

/** Allowance rows for prefilling forms, including rows saved before frequencies existed. */
export function payslipItems(p: PayslipInput | null | undefined): AllowanceItem[] {
  if (!p) return [];
  if (p.items) return p.items;
  return p.allowances ? [{ amount: p.allowances, per: "month" }] : [];
}
