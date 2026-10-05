"use client";

import { Icon } from "@/components/Icon";
import { deductionAmount, type PayDeduction } from "@/lib/paye";

export type DeductionRow = { name: string; type: "pct" | "amount"; value: string };

const num = (s: string) => {
  const n = Number(s.replace(/[,%\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
export const rowsToDeductions = (rows: DeductionRow[]): PayDeduction[] =>
  rows
    .map((r) => ({ name: r.name || undefined, type: r.type, value: r.type === "pct" ? Math.min(100, num(r.value)) : Math.round(num(r.value) * 100) }))
    .filter((d) => d.value > 0);
const f2 = (m: number) => new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m / 100);

/** Recurring after-tax deductions. Submits deductionName / deductionType / deductionValue. */
export function DeductionList({ rows, onChange, basic }: { rows: DeductionRow[]; onChange: (rows: DeductionRow[]) => void; basic: number }) {
  const upd = (i: number, p: Partial<DeductionRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const total = rowsToDeductions(rows).reduce((s, d) => s + deductionAmount(d, basic), 0);
  return (
    <fieldset className="sk-stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
      <legend className="sk-label" style={{ marginBottom: 2 }}>Monthly deductions after tax</legend>
      <span className="sk-cap" style={{ marginTop: -4 }}>Saving scheme, staff loan, welfare or union dues…</span>
      {rows.map((r, i) => {
        const amt = r.type === "pct" ? Math.round((basic * num(r.value)) / 100) : 0;
        return (
          <div key={i} className="sk-stack" style={{ gap: 4 }}>
            <div className="sk-allow">
              <input aria-label={`Deduction ${i + 1} name`} className="sk-input sk-input--sm sk-allow__name" name="deductionName" value={r.name} maxLength={40} placeholder="e.g. Saving scheme" onChange={(e) => upd(i, { name: e.target.value })} />
              <div className="sk-input sk-input--sm sk-allow__amt" style={{ minWidth: 0, gap: 6 }}>
                {r.type === "amount" ? <span className="sk-cap sk-allow__cur">GH₵</span> : null}
                <input aria-label={`Deduction ${i + 1} ${r.type === "pct" ? "percent of basic" : "amount"}`} name="deductionValue" inputMode="decimal" value={r.value} maxLength={14} placeholder={r.type === "pct" ? "5" : "0.00"} onChange={(e) => upd(i, { value: e.target.value })} />
                {r.type === "pct" ? <span className="sk-cap">%</span> : null}
              </div>
              <select aria-label={`Deduction ${i + 1} type`} className="sk-input sk-input--sm sk-allow__per" style={{ width: "auto", paddingRight: 8 }} name="deductionType" value={r.type} onChange={(e) => upd(i, { type: e.target.value as DeductionRow["type"] })}>
                <option value="pct">% of basic</option>
                <option value="amount">GH₵ a month</option>
              </select>
              <button type="button" className="sk-iconbtn" style={{ width: 42, height: 42 }} aria-label={`Remove deduction ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                <Icon name="close" />
              </button>
            </div>
            {r.type === "pct" && amt > 0 ? <span className="sk-cap" style={{ paddingLeft: 4 }}>GH₵ {f2(amt)} a month</span> : null}
          </div>
        );
      })}
      <div className="sk-between sk-wrap" style={{ gap: 8 }}>
        <button type="button" className="sk-link" style={{ fontSize: 14 }} disabled={rows.length >= 15} onClick={() => onChange([...rows, { name: "", type: "pct", value: "" }])}>
          + Add deduction
        </button>
        {total && rows.length > 1 ? <span className="sk-cap">GH₵ {f2(total)} a month in total</span> : null}
      </div>
    </fieldset>
  );
}

/** Non-cash benefits payroll taxes you on. Submits taxableBenefits. */
export function BenefitsField({ value, onChange, id = "taxableBenefits" }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <div className="sk-field">
      <label htmlFor={id}>Taxable benefits, not paid in cash (monthly)</label>
      <div className="sk-input sk-input--sm" style={{ gap: 6 }}>
        <span className="sk-cap">GH₵</span>
        <input id={id} name="taxableBenefits" inputMode="decimal" value={value} maxLength={14} placeholder="0.00" onChange={(e) => onChange(e.target.value)} />
      </div>
      <span className="sk-cap">Company car, fuel, housing… Added to taxable income only. If your PAYE looks too high, this is usually why; your payslip&apos;s &ldquo;taxable income&rdquo; tells you the amount.</span>
    </div>
  );
}
