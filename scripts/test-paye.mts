// Checks the PAYE engine against GRA tables and a published worked example. Run: npm run test:paye
import { calculatePay, bandTax, TAX_TABLES, yearOfPay } from "../src/lib/paye.ts";
const c = (n: number) => (n / 100).toFixed(2);
let fails = 0;
const eq = (name: string, got: number, want: number) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${c(got)} (want ${c(want)})`); };
// Published example (old bands): basic 6,000 -> SSNIT 330, PAYE 1,016.00
const a = calculatePay({ basic: 600000, date: "2026-03-15" });
eq("old bands SSNIT", a.ssnit, 33000); eq("old bands PAYE", a.paye, 101600); eq("old bands net", a.net, 600000 - 33000 - 101600);
// New bands, same pay: 0 + 4 + 10 + 507.50 + (5670-3668)*25% = 1,022.00
const b = calculatePay({ basic: 600000, date: "2026-10-05" });
eq("new bands PAYE", b.paye, 102200);
// Band boundaries (new): top of each band
const t = TAX_TABLES[0];
eq("tax at 588", bandTax(58800, t).total, 0);
eq("tax at 668", bandTax(66800, t).total, 400);
eq("tax at 768", bandTax(76800, t).total, 1400);
eq("tax at 3,668", bandTax(366800, t).total, 52150);
eq("tax at 19,668", bandTax(1966800, t).total, 452150);
eq("tax at 50,000", bandTax(5000000, t).total, 452150 + 909960);
eq("tax at 60,000 (35% top)", bandTax(6000000, t).total, 452150 + 909960 + 350000);
// Annual table cross-check: 12 x monthly bands == GRA annual table (600,000 -> 163,453.20)
eq("annual equivalence", bandTax(5000000, t).total * 12, 16345320);
// Bonus: basic 5,000; cap = 15% x 60,000 = 9,000. Bonus 10,000 -> 9,000 @5% = 450; 1,000 joins income
const d = calculatePay({ basic: 500000, bonus: 1000000, date: "2026-10-05" });
eq("bonus flat tax", d.bonusTax, 45000);
const dNo = calculatePay({ basic: 500000, date: "2026-10-05" });
eq("bonus excess taxed at marginal 25%", d.incomeTax - dNo.incomeTax, 25000);
// SSNIT ceiling 2026: basic 100,000 -> 5.5% of 69,000 = 3,795
eq("SSNIT ceiling", calculatePay({ basic: 10000000, date: "2026-10-05" }).ssnit, 379500);
// Tier 3: 20% of 4,000 = 800 contributed; relief capped at 16.5% = 660
const e = calculatePay({ basic: 400000, tier3Pct: 20, date: "2026-10-05" });
eq("tier3 contribution", e.tier3, 80000); eq("tier3 relief cap", e.tier3Relief, 66000);
// Junior employee overtime: basic 1,000; OT 700 -> 500 @5% + 200 @10% = 45
const f = calculatePay({ basic: 100000, overtime: 70000, date: "2026-10-05" });
eq("QJE overtime tax", f.overtimeTax, 4500);
console.log(fails ? `${fails} FAILED` : "ALL PASS");
if (fails) process.exit(1);

// ---- Allowances at different intervals (new bands) ----
{
  let f2 = 0;
  const check = (name: string, got: number, want: number) => { const ok = got === want; if (!ok) f2++; console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${(got / 100).toFixed(2)} (want ${(want / 100).toFixed(2)})`); };
  // Monthly-only allowances must equal the plain calculation.
  const plain = calculatePay({ basic: 600000, allowances: 50000, date: "2026-10-05" });
  const y1 = yearOfPay({ basic: 600000, items: [{ amount: 50000, per: "month" }], date: "2026-10-05" });
  check("monthly-only average == plain net", y1.averageNet, plain.net);
  // Basic 6,000 + quarterly 1,500 + yearly 6,000.
  const y2 = yearOfPay({ basic: 600000, items: [{ amount: 150000, per: "quarter" }, { amount: 600000, per: "year" }], date: "2026-10-05" });
  check("usual month net", y2.usual.net, 600000 - 33000 - 102200); // 4,648
  // Quarter month: taxable 5,670 + 1,500 = 7,170 -> 521.50 + 3,502 x 25% = 1,397.00
  check("quarter month tax", y2.quarterMonth!.paye, 139700);
  // Yearly month: taxable 5,670 + 6,000 = 11,670 -> 521.50 + 8,002 x 25% = 2,522.00
  check("year month tax", y2.yearMonth!.paye, 252200);
  // Annual: 7 usual + 4 quarter + 1 year months
  const want = 7 * 464800 + 4 * (750000 - 33000 - 139700) + (1200000 - 33000 - 252200);
  check("annual take-home", y2.annualNet, want);
  check("average monthly take-home", y2.averageNet, Math.round(want / 12));
  check("monthly equivalent of allowances", y2.monthlyAllowanceEquivalent, 100000); // (1,500x4 + 6,000)/12
  // After-tax value of each allowance (basic 6,000; usual taxable 5,670 sits in the 25% band).
  // Quarterly 1,500 adds 1,397 - 1,022 = 375 tax -> keep 1,125 per quarter, 4,500 a year.
  check("quarterly allowance tax", y2.allowances[0].tax, 37500);
  check("quarterly allowance kept per year", y2.allowances[0].keptPerYear, 450000);
  // Yearly 6,000 adds 2,522 - 1,022 = 1,500 -> keep 4,500.
  check("yearly allowance kept", y2.allowances[1].kept, 450000);
  // Two monthly allowances share their combined tax by amount: 500 + 300 on basic 6,000 -> 800 x 25% = 200.
  const y3 = yearOfPay({ basic: 600000, items: [{ amount: 50000, per: "month" }, { amount: 30000, per: "month" }], date: "2026-10-05" });
  check("monthly allowance A tax", y3.allowances[0].tax, 12500);
  check("monthly allowance B tax", y3.allowances[1].tax, 7500);
  // Per-allowance tax must add up exactly to the year's extra tax from allowances.
  const noAllow = yearOfPay({ basic: 600000, items: [], date: "2026-10-05" });
  const perItemYear = y2.allowances.reduce((s, a) => s + a.tax * ({ month: 12, quarter: 4, year: 1 } as const)[a.per], 0);
  check("allowance tax sums to total", perItemYear, y2.annualTax - noAllow.annualTax);
  // Allowance straddling bands: basic 3,000 (taxable 2,835) + 2,000 monthly -> taxable 4,835.
  // Without: 0+4+10+(2,835-768)x17.5% = 375.725 -> 375.73; with: 521.50 + 1,167x25% = 813.25 -> extra 437.52
  const y4 = yearOfPay({ basic: 300000, items: [{ amount: 200000, per: "month" }], date: "2026-10-05" });
  check("band-straddling allowance tax", y4.allowances[0].tax, 43752);
  if (f2) { console.log(`${f2} FAILED (allowances)`); process.exit(1); } else console.log("ALLOWANCES PASS");
}
