// Checks the PAYE engine against GRA tables and a published worked example. Run: npm run test:paye
import { calculatePay, bandTax, TAX_TABLES } from "../src/lib/paye.ts";
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
