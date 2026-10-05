"use client";

import { useId } from "react";
import { Icon } from "@/components/Icon";
import { FREQUENCY_LABEL, monthlyEquivalent, type AllowanceAfterTax, type AllowanceFrequency } from "@/lib/paye";

export type AllowanceRow = { name: string; amount: string; per: AllowanceFrequency };

const toMinor = (s: string) => {
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
export const rowsToItems = (rows: AllowanceRow[]) => rows.map((r) => ({ amount: toMinor(r.amount), per: r.per })).filter((r) => r.amount > 0);
const f2 = (m: number) => new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m / 100);

/** Allowances with their own pay frequency. Submits allowanceName / allowanceAmount / allowancePer. */
const EACH: Record<AllowanceFrequency, string> = { month: "each month", quarter: "each quarter", year: "once a year" };

/** `afterTax` lines up with the non-empty rows, in order (as returned by yearOfPay for rowsToItems(rows)). */
export function AllowanceList({ rows, onChange, afterTax }: { rows: AllowanceRow[]; onChange: (rows: AllowanceRow[]) => void; afterTax?: AllowanceAfterTax[] }) {
  const uid = useId();
  const upd = (i: number, p: Partial<AllowanceRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const items = rowsToItems(rows);
  const lumpy = items.some((a) => a.per !== "month");
  let k = 0;
  const keptFor = rows.map((r) => (toMinor(r.amount) > 0 ? (afterTax?.[k++] ?? null) : null));
  const yearPaid = afterTax?.reduce((s, a) => s + a.amount * ({ month: 12, quarter: 4, year: 1 } as const)[a.per], 0) ?? 0;
  const yearKept = afterTax?.reduce((s, a) => s + a.keptPerYear, 0) ?? 0;
  return (
    <fieldset className="sk-stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
      <legend className="sk-label" style={{ marginBottom: 6 }}>Allowances</legend>
      {rows.map((r, i) => (
        <div key={i} className="sk-stack" style={{ gap: 4 }}>
        <div className="sk-allow">
          <input
            aria-label={`Allowance ${i + 1} name`}
            className="sk-input sk-input--sm sk-allow__name"
            name="allowanceName"
            value={r.name}
            maxLength={40}
            placeholder="e.g. Transport"
            onChange={(e) => upd(i, { name: e.target.value })}
          />
          <div className="sk-input sk-input--sm sk-allow__amt" style={{ minWidth: 0, gap: 6 }}>
            <span className="sk-cap sk-allow__cur">GH₵</span>
            <input aria-label={`Allowance ${i + 1} amount`} name="allowanceAmount" inputMode="decimal" value={r.amount} maxLength={14} placeholder="0.00" onChange={(e) => upd(i, { amount: e.target.value })} />
          </div>
          <select
            aria-label={`How often allowance ${i + 1} is paid`}
            id={`${uid}-per-${i}`}
            className="sk-input sk-input--sm sk-allow__per"
            style={{ width: "auto", paddingRight: 8 }}
            name="allowancePer"
            value={r.per}
            onChange={(e) => upd(i, { per: e.target.value as AllowanceFrequency })}
          >
            {(Object.keys(FREQUENCY_LABEL) as AllowanceFrequency[]).map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
            ))}
          </select>
          <button type="button" className="sk-iconbtn" style={{ width: 42, height: 42 }} aria-label={`Remove allowance ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Icon name="close" />
          </button>
        </div>
        {keptFor[i] ? (
          <span className="sk-cap" style={{ paddingLeft: 4 }}>
            {keptFor[i]!.tax === 0
              ? "No tax on this at your pay."
              : `You keep GH₵ ${f2(keptFor[i]!.kept)} ${EACH[r.per]} after tax (${Math.round(keptFor[i]!.rate * 1000) / 10}% tax)${r.per === "quarter" ? ` · GH₵ ${f2(keptFor[i]!.keptPerYear)} a year` : ""}.`}
          </span>
        ) : null}
        </div>
      ))}
      <div className="sk-between sk-wrap" style={{ gap: 8 }}>
        <button type="button" className="sk-link" style={{ fontSize: 14 }} disabled={rows.length >= 15} onClick={() => onChange([...rows, { name: "", amount: "", per: "month" }])}>
          + Add allowance
        </button>
        {items.length ? (
          <span className="sk-cap right">
            {lumpy ? "≈ " : ""}GH₵ {f2(monthlyEquivalent(items))} a month{lumpy ? " on average" : ""}
            {afterTax?.length && yearPaid ? <><br />You keep GH₵ {f2(yearKept)} of GH₵ {f2(yearPaid)} a year</> : null}
          </span>
        ) : null}
      </div>
    </fieldset>
  );
}
