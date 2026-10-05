"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import { calculatePay, QJE_ANNUAL_LIMIT, TIER3_RELIEF_CAP, yearOfPay } from "@/lib/paye";
import { AllowanceList, rowsToItems, type AllowanceRow } from "@/components/AllowanceList";
import { BenefitsField, DeductionList, rowsToDeductions, type DeductionRow } from "@/components/DeductionList";
import { saveTakeHomeFromGross } from "@/app/(app)/_actions/tax";

const toMinor = (s: string) => {
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const f2 = (m: number) => new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m / 100);
const f0 = (m: number) => new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 }).format(Math.round(m / 100));

type Init = { basic: string; tier3Pct: string; items: AllowanceRow[]; deductions: DeductionRow[]; taxableBenefits: string };

function Money({ id, label, value, set, hint }: { id: string; label: string; value: string; set: (v: string) => void; hint?: string }) {
  return (
    <div className="sk-field">
      <label htmlFor={id}>{label}</label>
      <div className="sk-input sk-input--sm">
        <span className="sk-cap">GH₵</span>
        <input id={id} name={id} inputMode="decimal" value={value} maxLength={14} placeholder="0.00" onChange={(e) => set(e.target.value)} />
      </div>
      {hint ? <span className="sk-cap">{hint}</span> : null}
    </div>
  );
}

export function TaxCalculator({ initial, today }: { initial: Init; today: string }) {
  const [basic, setBasic] = useState(initial.basic);
  const [allowanceRows, setAllowanceRows] = useState<AllowanceRow[]>(initial.items);
  const [bonus, setBonus] = useState("");
  const [overtime, setOvertime] = useState("");
  const [tier3, setTier3] = useState(initial.tier3Pct);
  const [deductionRows, setDeductionRows] = useState<DeductionRow[]>(initial.deductions);
  const [benefits, setBenefits] = useState(initial.taxableBenefits);
  const [other, setOther] = useState("");
  const tier3Pct = Math.min(50, Math.max(0, Number(tier3) || 0));
  const items = rowsToItems(allowanceRows);
  const monthlyAllowances = items.filter((a) => a.per === "month").reduce((s, a) => s + a.amount, 0);
  const deductions = rowsToDeductions(deductionRows);
  const taxableBenefits = toMinor(benefits);
  const year = yearOfPay({ basic: toMinor(basic), items, tier3Pct, deductions, taxableBenefits, date: today });
  const lumpy = Boolean(year.quarterMonth || year.yearMonth);
  const p = calculatePay({
    basic: toMinor(basic),
    allowances: monthlyAllowances,
    bonus: toMinor(bonus),
    overtime: toMinor(overtime),
    tier3Pct,
    deductions,
    taxableBenefits,
    otherDeductions: toMinor(other),
    date: today,
  });
  const has = toMinor(basic) > 0;
  const oneOffs = toMinor(bonus) + toMinor(overtime) + toMinor(other) > 0;

  const rows: [string, number, string?][] = [
    ["Basic salary", toMinor(basic)],
    ...(monthlyAllowances ? ([[lumpy ? "Monthly allowances" : "Allowances", monthlyAllowances]] as [string, number][]) : []),
    ...(toMinor(bonus) ? ([["Bonus", toMinor(bonus)]] as [string, number][]) : []),
    ...(toMinor(overtime) ? ([["Overtime", toMinor(overtime)]] as [string, number][]) : []),
    ["Gross pay", p.gross, "sum"],
    [`SSNIT, your 5.5%${p.ssnitBase < toMinor(basic) ? " (capped)" : ""}`, -p.ssnit],
    ...(p.tier3 ? ([[`Tier 3, ${tier3Pct}% of basic`, -p.tier3]] as [string, number][]) : []),
    ["Income tax (PAYE)", -p.incomeTax],
    ...(p.bonusTax ? ([["Bonus tax (5%)", -p.bonusTax]] as [string, number][]) : []),
    ...(p.overtimeTax ? ([["Overtime tax (junior staff rate)", -p.overtimeTax]] as [string, number][]) : []),
    ...p.deductions.filter((d) => d.amount).map((d, i) => [d.name || `Deduction ${i + 1}`, -d.amount] as [string, number]),
    ...(p.otherDeductions ? ([["One-off deductions", -p.otherDeductions]] as [string, number][]) : []),
    ["Take-home pay", p.net, "total"],
  ];

  return (
    <div className="sk-grid g-main" style={{ alignItems: "start" }}>
      <div className="sk-stack" style={{ gap: 16 }}>
        <div className="hide-desktop sk-between" aria-live="polite" style={{ position: "sticky", top: 8, zIndex: 5, background: "var(--hero)", color: "var(--on-hero)", borderRadius: "var(--radius-pill)", padding: "10px 18px", boxShadow: "var(--shadow-float)" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Take-home</span>
          <b className="sk-num" style={{ fontSize: 20 }}>GH₵ {f2(Math.max(0, p.net))}</b>
        </div>
        <div className="sk-card sk-card--pad sk-stack">
          <b className="sk-h">Every month</b>
          <div className="sk-grid g-2" style={{ gap: 12 }}>
            <Money id="basic" label="Basic salary (monthly)" value={basic} set={setBasic} />
            <div className="sk-field">
              <label htmlFor="tier3Pct">Tier 3 (your %)</label>
              <div className="sk-input sk-input--sm">
                <input id="tier3Pct" name="tier3Pct" inputMode="decimal" value={tier3} maxLength={5} placeholder="0" onChange={(e) => setTier3(e.target.value)} />
                <span className="sk-cap">%</span>
              </div>
              <span className="sk-cap">Voluntary. Tax-free up to {TIER3_RELIEF_CAP * 100}%</span>
            </div>
          </div>
          <AllowanceList rows={allowanceRows} onChange={setAllowanceRows} afterTax={has ? year.allowances : undefined} />
          <span className="sk-cap">Transport, rent, fuel, clothing… Pick how often each is paid; we&apos;ll do the maths.</span>
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }} className="sk-stack">
            <DeductionList rows={deductionRows} onChange={setDeductionRows} basic={toMinor(basic)} />
          </div>
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <BenefitsField value={benefits} onChange={setBenefits} />
          </div>
        </div>
        <div className="sk-card sk-card--pad sk-stack">
          <div>
            <b className="sk-h">This month only</b>
            <div className="sk-cap">Leave blank if you didn&apos;t get any.</div>
          </div>
          <div className="sk-grid g-3" style={{ gap: 12 }}>
            <Money id="bonus" label="Bonus" value={bonus} set={setBonus} />
            <Money id="overtime" label="Overtime" value={overtime} set={setOvertime} />
            <Money id="other" label="One-off deductions" value={other} set={setOther} hint="After tax, this month only" />
          </div>
        </div>

        {has ? (
          <div className="sk-card sk-card--pad sk-stack">
            <div>
              <b className="sk-h">How the income tax is worked out</b>
              <div className="sk-cap">
                Taxable income GH₵ {f2(p.chargeable)} = basic + allowances{p.taxableBenefits ? " + taxable benefits" : ""}{p.bonusTaxedAtFlat < toMinor(bonus) ? " + bonus above the 5% limit" : ""}
                {toMinor(overtime) && !p.juniorEmployee ? " + overtime" : ""} − SSNIT{p.pensionRelief ? ` − Tier 3${p.pensionRelief < p.tier3 ? " (up to 16.5% of basic)" : ""}` : ""}.
              </div>
            </div>
            <div className="sk-tablewrap">
              <table className="sk-table">
                <thead>
                  <tr><th>Band</th><th className="r">Rate</th><th className="r">Taxed</th><th className="r">Tax</th></tr>
                </thead>
                <tbody>
                  {p.bands.map((b, i) => (
                    <tr key={i} style={{ opacity: b.taxed ? 1 : 0.45 }}>
                      <td>{b.to == null ? `Above ${f0(b.from)}` : i === 0 ? `First ${f0(b.to)}` : `${f0(b.from)} – ${f0(b.to)}`}</td>
                      <td className="r">{b.rate * 100}%</td>
                      <td className="r">{f2(b.taxed)}</td>
                      <td className="r">{f2(b.tax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={3}>Income tax</td><td className="r">{f2(p.incomeTax)}</td></tr>
                </tfoot>
              </table>
            </div>
            {toMinor(bonus) ? (
              <p className="sk-cap">
                Bonus: up to 15% of your annual basic (GH₵ {f2(Math.round(toMinor(basic) * 12 * 0.15))}) is taxed at a flat 5%.
                {p.bonusTaxedAtFlat < toMinor(bonus) ? ` The other GH₵ ${f2(toMinor(bonus) - p.bonusTaxedAtFlat)} is added to taxable income.` : ""}
              </p>
            ) : null}
            {toMinor(overtime) ? (
              <p className="sk-cap">
                {p.juniorEmployee
                  ? "Overtime: you earn under GH₵ 18,000 a year, so it's taxed at 5% up to half your basic and 10% above."
                  : `Overtime: the 5%/10% junior staff rate applies only up to GH₵ ${f0(QJE_ANNUAL_LIMIT)} a year, so yours is taxed with your salary.`}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside className="sk-stack" style={{ gap: 16, position: "sticky", top: 16 }}>
        <div className="sk-hero sk-stack" style={{ gap: 6 }}>
          <div className="sk-hero__deco" />
          <div className="sk-over">{lumpy ? "Take-home in a usual month" : "Take-home pay"}</div>
          <span className="sk-num" style={{ fontSize: 40, lineHeight: "44px" }}>
            <span className="sk-cur">GH₵</span>
            {f2(Math.max(0, p.net))}
          </span>
          <div className="sk-cap">
            {!has ? "Enter your basic salary" : lumpy ? `GH₵ ${f2(year.averageNet)} a month on average over the year` : `${Math.round((p.net / Math.max(1, p.gross)) * 100)}% of GH₵ ${f2(p.gross)} gross`}
          </div>
        </div>
        {has ? (
          <div className="sk-card sk-card--pad">
            <dl style={{ margin: 0 }}>
              {rows.map(([k, v, kind]) => (
                <div
                  key={k}
                  className="sk-between"
                  style={{ padding: "7px 0", borderTop: kind ? "1px solid var(--line)" : undefined, fontWeight: kind === "total" ? 700 : kind === "sum" ? 600 : 400 }}
                >
                  <dt className={kind ? "" : "sk-cap"} style={{ color: kind ? "var(--ink)" : undefined }}>{k}</dt>
                  <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }} className={v < 0 ? "" : kind === "total" ? "t-income" : ""}>
                    {v < 0 ? "−" : ""}{f2(Math.abs(v))}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        {has && lumpy ? (
          <div className="sk-card sk-card--pad sk-stack" style={{ gap: 6 }}>
            <b>Across the year</b>
            <p className="sk-cap">Quarterly and yearly allowances are taxed in the month they&apos;re paid, so those payslips are bigger and taxed more.</p>
            <dl style={{ margin: 0 }}>
              {(
                [
                  ["Usual month", year.usual.net, `×${12 - (year.quarterMonth ? 4 : 0) - (year.yearMonth ? 1 : 0)}`],
                  ...(year.quarterMonth ? ([["Month with quarterly allowances", year.quarterMonth.net, "×4"]] as const) : []),
                  ...(year.yearMonth ? ([["Month with yearly allowances", year.yearMonth.net, "×1"]] as const) : []),
                ] as const
              ).map(([k, v, n]) => (
                <div key={k} className="sk-between" style={{ padding: "5px 0" }}>
                  <dt className="sk-cap">{k} <span style={{ opacity: 0.7 }}>{n}</span></dt>
                  <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{f2(v)}</dd>
                </div>
              ))}
              <div className="sk-between" style={{ padding: "7px 0", borderTop: "1px solid var(--line)" }}>
                <dt className="sk-cap">Tax for the year</dt>
                <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{f2(year.annualTax)}</dd>
              </div>
              <div className="sk-between" style={{ padding: "7px 0", borderTop: "1px solid var(--line)", fontWeight: 700 }}>
                <dt>Average a month</dt>
                <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }} className="t-income">{f2(year.averageNet)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
        {has ? (
          <div className="sk-card sk-card--flat sk-card--pad sk-stack" style={{ gap: 6 }}>
            <b>Your pension, paid by you and your employer</b>
            <div className="sk-between sk-cap"><span>You 5.5% + employer 13%</span><span>{f2(p.ssnit + p.employerSsnit)}</span></div>
            <div className="sk-between sk-cap"><span>To SSNIT (Tier 1, 13.5%)</span><span>{f2(p.ssnit + p.employerSsnit - p.tier2)}</span></div>
            <div className="sk-between sk-cap"><span>To your Tier 2 fund (5%)</span><span>{f2(p.tier2)}</span></div>
            <p className="sk-cap">Tier 2 comes out of that 18.5%; it isn&apos;t taken from your pay a second time.</p>
          </div>
        ) : null}
        <ActionForm action={saveTakeHomeFromGross} showOk className="sk-stack">
          <input type="hidden" name="basic" value={basic} />
          <input type="hidden" name="tier3Pct" value={tier3} />
          <input type="hidden" name="taxableBenefits" value={benefits} />
          {deductionRows.map((r, i) => (
            <span key={`d${i}`} hidden>
              <input type="hidden" name="deductionName" value={r.name} />
              <input type="hidden" name="deductionType" value={r.type} />
              <input type="hidden" name="deductionValue" value={r.value} />
            </span>
          ))}
          {allowanceRows.map((r, i) => (
            <span key={i} hidden>
              <input type="hidden" name="allowanceName" value={r.name} />
              <input type="hidden" name="allowanceAmount" value={r.amount} />
              <input type="hidden" name="allowancePer" value={r.per} />
            </span>
          ))}
          <Submit pendingText="Saving…">Use GH₵ {f2(Math.max(0, year.averageNet))} as my monthly take-home</Submit>
          {lumpy || oneOffs ? (
            <span className="sk-cap">
              {lumpy ? "That's your average month, so lump sums are spread across the plan. " : ""}
              {oneOffs ? "Bonus, overtime and one-off deductions are left out; they don't happen every month." : ""}
            </span>
          ) : null}
        </ActionForm>
        <p className="sk-cap">
          {p.table.label}, SSNIT and Tier 3 rules for resident employees. This is an estimate, not tax advice. Your employer&apos;s payroll may round differently.
        </p>
      </aside>
    </div>
  );
}
