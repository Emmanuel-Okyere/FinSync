// Transfer charge rules. Run: npm run test:fees
import { DEFAULT_FEES, feeRules, transferFee } from "../src/lib/fees.ts";

let fails = 0;
const eq = (name: string, got: number, want: number) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${(got / 100).toFixed(2)} (want ${(want / 100).toFixed(2)})`);
};
const R = DEFAULT_FEES;
eq("MoMo send 45.00 (0.75%)", transferFee(4500, "momo", R), 34); // 0.3375 -> 0.34
eq("MoMo send 1,000 (0.75%)", transferFee(100000, "momo", R), 750);
eq("MoMo send 5,000 capped at 7.50", transferFee(500000, "momo", R), 750);
eq("Bank 1,500 (1%)", transferFee(150000, "bank", R), 1500);
eq("Bank 5,000 capped at 20", transferFee(500000, "bank", R), 2000);
eq("MoMoPay / bill is free", transferFee(50000, "momopay", R), 0);
eq("GhanaPay is free", transferFee(50000, "ghanapay", R), 0);
eq("Cash never charged", transferFee(50000, "cash", feeRules({ cash: { pct: 5, cap: 0 } })), 0);
// User's own rules override defaults: MoMo 1% capped at 10.
const mine = feeRules({ momo: { pct: 1, cap: 1000 } });
eq("custom MoMo 1% of 450", transferFee(45000, "momo", mine), 450);
eq("custom MoMo cap 10", transferFee(300000, "momo", mine), 1000);
eq("custom rules keep other defaults", transferFee(500000, "bank", mine), 2000);
eq("no cap means percentage only", transferFee(500000, "card", feeRules({ card: { pct: 1.5, cap: 0 } })), 7500);
// Statement imports: a MoMo fee column becomes the entry's charge (expenses only).
const { extractRows, parseCsv } = await import("../src/lib/import.ts");
const st = extractRows(parseCsv("Transaction Date,Description,Amount,Fees,E-Levy\n2026-10-02,Kofi Mensah,-450.00,3.38,0\n2026-10-03,Salary,5000.00,0,0\n"), "momo").rows;
eq("statement fee on a send", st[0]?.feeMinor ?? 0, 338);
eq("no fee on money in", st[1]?.feeMinor ?? 0, 0);
// Automatic savings in a bank statement: linked to the payment next to them, never to loan repayments.
const { markAutoSaves } = await import("../src/lib/import.ts");
const same = (name: string, got: string, want: string) => {
  if (got !== want) fails++;
  console.log(`${got === want ? "PASS" : "FAIL"} ${name}: ${got} (want ${want})`);
};
const ex = (rows: { name: string; amountMinor: number; categoryId?: string }[]) =>
  markAutoSaves(rows.map((r) => ({ ...r, kind: "expense", occurredOn: "2026-10-02" })), 10000, ["debt"]).map((r) => r.saveFor ?? -1).join(",");
same("saving after a payment", ex([{ name: "POS Shoprite", amountMinor: 45000 }, { name: "TRF", amountMinor: 10000 }]), "-1,0");
same("saving before a payment (newest first)", ex([{ name: "Lifestyle savings", amountMinor: 15000 }, { name: "POS Shoprite", amountMinor: 45000 }]), "1,-1");
same("no saving on loan repayment", ex([{ name: "Loan repay", amountMinor: 80000, categoryId: "debt" }, { name: "TRF", amountMinor: 10000 }]), "-1,-1");
same("two payments, two savings", ex([{ name: "A", amountMinor: 5000 }, { name: "Auto save", amountMinor: 10000 }, { name: "B", amountMinor: 7000 }, { name: "Auto save", amountMinor: 10000 }]), "-1,0,-1,2");
console.log(fails ? `${fails} FAILED` : "ALL PASS");
if (fails) process.exit(1);
