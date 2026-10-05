import "server-only";
import type { PayslipInput } from "@/db/schema";
import { UserError } from "@/lib/action";
import { parseMoney } from "@/lib/money";
import { monthlyEquivalent, yearOfPay, type AllowanceFrequency, type AllowanceItem, type PayDeduction } from "@/lib/paye";

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

  const dNames = fd.getAll("deductionName").map((v) => String(v).trim().slice(0, 40));
  const dTypes = fd.getAll("deductionType").map(String);
  const dValues = fd.getAll("deductionValue").map(String);
  if (dValues.length > 15) throw new UserError("Add at most 15 deductions.");
  const deductions: PayDeduction[] = [];
  dValues.forEach((raw, i) => {
    if (!raw.trim()) return;
    const label = dNames[i] || `Deduction ${i + 1}`;
    const type = dTypes[i] === "pct" ? "pct" : dTypes[i] === "amount" ? "amount" : null;
    if (!type) throw new UserError(`${label}: choose % of basic or a fixed amount`);
    let value: number | null;
    if (type === "pct") {
      value = Number(raw.replace(/[%\s]/g, ""));
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new UserError(`${label}: enter a percentage between 0 and 100`);
    } else {
      value = parseMoney(raw);
      if (value == null) throw new UserError(`${label}: enter an amount like 200`);
    }
    if (value > 0) deductions.push({ ...(dNames[i] ? { name: dNames[i] } : {}), type, value });
  });

  const benefitsRaw = String(fd.get("taxableBenefits") ?? "").trim();
  const taxableBenefits = benefitsRaw ? parseMoney(benefitsRaw) : 0;
  if (taxableBenefits == null) throw new UserError("Taxable benefits: enter an amount like 1,000");

  const year = yearOfPay({ basic, items, tier3Pct, deductions, taxableBenefits, date: today });
  return {
    payslip: { basic, allowances: monthlyEquivalent(items), tier3Pct, items, deductions, taxableBenefits },
    net: year.averageNet,
  };
}

/** Allowance rows for prefilling forms, including rows saved before frequencies existed. */
export function payslipItems(p: PayslipInput | null | undefined): AllowanceItem[] {
  if (!p) return [];
  if (p.items) return p.items;
  return p.allowances ? [{ amount: p.allowances, per: "month" }] : [];
}

/** Deduction rows for prefilling forms. */
export function payslipDeductionRows(p: PayslipInput | null | undefined) {
  return (p?.deductions ?? []).map((d) => ({ name: d.name ?? "", type: d.type, value: d.type === "pct" ? String(d.value) : (d.value / 100).toFixed(2) }));
}
