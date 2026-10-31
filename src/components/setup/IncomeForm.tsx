"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import type { FormState } from "@/lib/action";
import { yearOfPay } from "@/lib/paye";
import { cycleBounds, fmtCycle, fmtShort, fmtWeekday, nextPaydayDetail, weekendLabel, type WeekendShift } from "@/lib/dates";
import { AllowanceList, rowsToItems, type AllowanceRow } from "@/components/AllowanceList";
import { BenefitsField, DeductionList, rowsToDeductions, type DeductionRow } from "@/components/DeductionList";

type Extra = { name: string; amount: string };
const parse = (s: string) => {
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const weekdayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
const fmt = (n: number) => new Intl.NumberFormat("en-GH", { maximumFractionDigits: 2 }).format(n);

export function IncomeForm({
  action,
  initial,
  submitLabel = "Continue",
  returnTo,
  compact = false,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  initial: {
    main: string;
    kind: string;
    payday: string;
    paydayDay: number | null;
    paydayWeekend?: string;
    budgetCycle?: string;
    extras: Extra[];
    payslip?: { basic: string; tier3Pct: string; items: AllowanceRow[]; deductions: DeductionRow[]; taxableBenefits: string } | null;
  };
  submitLabel?: string;
  returnTo?: string;
  /** Single column, for dialogs (no side summary column). */
  compact?: boolean;
}) {
  const [netInput, setNetInput] = useState(initial.main);
  const [kind, setKind] = useState(initial.kind);
  const [mode, setMode] = useState<"net" | "gross">(initial.payslip ? "gross" : "net");
  const [basic, setBasic] = useState(initial.payslip?.basic ?? "");
  const [allowances, setAllowances] = useState<AllowanceRow[]>(initial.payslip?.items ?? []);
  const [tier3, setTier3] = useState(initial.payslip?.tier3Pct ?? "");
  const [deductions, setDeductions] = useState<DeductionRow[]>(initial.payslip?.deductions ?? []);
  const [benefits, setBenefits] = useState(initial.payslip?.taxableBenefits ?? "");
  const [more, setMore] = useState(Boolean(initial.payslip?.deductions.length || initial.payslip?.taxableBenefits));
  const gross = mode === "gross" && kind === "salary";
  const year = gross
    ? yearOfPay({ basic: Math.round(parse(basic) * 100), items: rowsToItems(allowances), tier3Pct: parse(tier3), deductions: rowsToDeductions(deductions), taxableBenefits: Math.round(parse(benefits) * 100), date: new Date().toISOString().slice(0, 10) })
    : null;
  const pay = year
    ? {
        ...year.usual,
        basicPlus: Math.round(parse(basic) * 100) + year.monthlyAllowanceEquivalent,
        // Residual so the lines add up exactly to the saved average (within a pesewa of annual tax ÷ 12).
        avgTax: Math.round(parse(basic) * 100) + year.monthlyAllowanceEquivalent - year.usual.ssnit - year.usual.tier3 - year.usual.deductionsTotal - year.averageNet,
      }
    : null;
  const main = year ? (parse(basic) ? (year.averageNet / 100).toFixed(2) : "") : netInput;
  const lumpy = Boolean(year && (year.quarterMonth || year.yearMonth));
  const [payday, setPayday] = useState(initial.payday);
  const [paydayDay, setPaydayDay] = useState(String(initial.paydayDay ?? 28));
  const [weekend, setWeekend] = useState<WeekendShift>((initial.paydayWeekend as WeekendShift) ?? "before");
  const fixedDate = ["25th", "date", "last_day", "day_before_last"].includes(payday);
  const [cycle, setCycle] = useState(initial.budgetCycle ?? "payday");
  const dayNum = Number(paydayDay);
  const today = new Date().toISOString().slice(0, 10);
  const cyclePreview = (() => {
    if (payday === "date" && !(Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31)) return null;
    const b = cycleBounds({ mode: "payday", rule: payday, day: payday === "date" ? dayNum : null, weekend }, today);
    return fmtCycle(b.start, b.end);
  })();
  const preview =
    payday !== "date" || (Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31)
      ? nextPaydayDetail(payday, payday === "date" ? dayNum : null, today, weekend)
      : null;
  const [extras, setExtras] = useState<Extra[]>(initial.extras);
  // Only regular pay is planned; income that varies is counted when it actually arrives.
  const total = parse(main);
  const hasVarying = extras.some((e) => e.name.trim() || parse(e.amount));

  return (
    <ActionForm action={action} className={compact ? "sk-setup sk-setup--stack" : "sk-setup"}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <div className="sk-stack" style={{ gap: 16 }}>
        <div className="sk-card sk-card--pad sk-stack">
          <label className="sk-over" htmlFor="main">Main income · after tax and SSNIT</label>
          <div className="sk-amount">
            <span className="sk-cur">GH₵</span>
            <input
              id="main"
              name="main"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={main}
              onChange={(e) => setNetInput(e.target.value)}
              readOnly={gross}
              style={{ width: `${Math.max(1, main.length) + 0.5}ch` }}
              aria-describedby={gross ? "main-calc" : undefined}
              required
              maxLength={14}
            />
          </div>
          <input type="hidden" name="mode" value={gross ? "gross" : "net"} />
          {kind === "salary" && !gross ? (
            <button type="button" className="sk-link" style={{ alignSelf: "center", fontSize: 14 }} onClick={() => setMode("gross")}>
              Only know your gross? Work it out
            </button>
          ) : null}
          {gross && pay ? (
            <div className="sk-card sk-card--flat sk-stack" style={{ gap: 12 }} id="main-calc">
              <div className="sk-grid g-2" style={{ gap: 10 }}>
                <div className="sk-field">
                  <label htmlFor="basic">Basic salary (monthly)</label>
                  <input id="basic" className="sk-input sk-input--sm" name="basic" inputMode="decimal" value={basic} maxLength={14} onChange={(e) => setBasic(e.target.value)} placeholder="0.00" required />
                </div>
                <div className="sk-field">
                  <label htmlFor="tier3Pct">Tier 3 (% of basic)</label>
                  <input id="tier3Pct" className="sk-input sk-input--sm" name="tier3Pct" inputMode="decimal" value={tier3} maxLength={5} onChange={(e) => setTier3(e.target.value)} placeholder="0" />
                </div>
              </div>
              <AllowanceList rows={allowances} onChange={setAllowances} afterTax={year && parse(basic) ? year.allowances : undefined} />
              {more ? (
                <div className="sk-stack" style={{ gap: 12, paddingTop: 4, borderTop: "1px solid var(--line)" }}>
                  <DeductionList rows={deductions} onChange={setDeductions} basic={Math.round(parse(basic) * 100)} />
                  <BenefitsField value={benefits} onChange={setBenefits} />
                </div>
              ) : (
                <button type="button" className="sk-link" style={{ fontSize: 14, alignSelf: "flex-start" }} onClick={() => (setMore(true), deductions.length || setDeductions([{ name: "", type: "pct", value: "" }]))}>
                  More from your payslip? Add deductions or taxable benefits
                </button>
              )}
              <dl className="sk-stack" style={{ gap: 6, margin: 0, fontSize: 14 }}>
                {(
                  [
                    [lumpy ? "Gross pay (monthly average)" : "Gross pay", pay.basicPlus, ""],
                    ["SSNIT (5.5% of basic)", -pay.ssnit, ""],
                    ...(pay.tier3 ? ([["Tier 3", -pay.tier3, ""]] as const) : []),
                    ...(pay.deductionsTotal ? ([["Deductions after tax", -pay.deductionsTotal, ""]] as const) : []),
                    [lumpy ? "Income tax (monthly average)" : "Income tax (PAYE)", -pay.avgTax, ""],
                    [lumpy ? "Take-home (monthly average)" : "Take-home", year!.averageNet, "b"],
                  ] as const
                ).map(([k, v, b]) => (
                  <div key={k} className="sk-between" style={b ? { borderTop: "1px solid var(--line)", paddingTop: 6, fontWeight: 700 } : undefined}>
                    <dt className={b ? "" : "sk-cap"}>{k}</dt>
                    <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{v < 0 ? "−" : ""}{fmt(Math.abs(v) / 100)}</dd>
                  </div>
                ))}
              </dl>
              {lumpy ? (
                <p className="sk-cap">
                  Lump sums are taxed in the month they&apos;re paid. Usual month: GH₵ {fmt(year!.usual.net / 100)}
                  {year!.quarterMonth ? ` · quarter months: GH₵ ${fmt(year!.quarterMonth.net / 100)}` : ""}
                  {year!.yearMonth ? ` · yearly allowance month: GH₵ ${fmt(year!.yearMonth.net / 100)}` : ""}. We budget with the average.
                </p>
              ) : null}
              <div className="sk-between sk-wrap" style={{ gap: 8 }}>
                <span className="sk-cap">{pay.table.label}. An estimate; check it against your payslip.</span>
                <button type="button" className="sk-link" style={{ fontSize: 14 }} onClick={() => (setNetInput(main), setMode("net"))}>
                  Enter take-home instead
                </button>
              </div>
            </div>
          ) : null}
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="sk-stack">
            <legend className="sk-label" style={{ marginBottom: 8 }}>What is it?</legend>
            <div className="sk-chips sk-wrap">
              {[
                ["salary", "Salary"],
                ["business", "Business"],
                ["allowance", "Allowance"],
                ["other", "Other"],
              ].map(([v, l]) => (
                <label key={v} className="sk-chip">
                  <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset className="sk-card sk-card--pad" style={{ border: 0, margin: 0 }}>
          <legend className="sk-label" style={{ float: "left", width: "100%", marginBottom: 10 }}>When is payday?</legend>
          <div className="sk-chips sk-wrap">
            {[
              ["date", "Set date"],
              ["25th", "25th"],
              ["last_working_day", "Last working day"],
              ["last_day", "Last day of month"],
              ["day_before_last", "Day before month ends"],
              ["weekly", "Weekly"],
            ].map(([v, l]) => (
              <label key={v} className="sk-chip">
                <input type="radio" name="payday" value={v} checked={payday === v} onChange={() => setPayday(v)} />
                {l}
              </label>
            ))}
          </div>
          {payday === "date" ? (
            <div className="sk-field" style={{ marginTop: 12, maxWidth: 200 }}>
              <label htmlFor="paydayDay">Day of the month</label>
              <input id="paydayDay" className="sk-input" name="paydayDay" type="number" min={1} max={31} value={paydayDay} onChange={(e) => setPaydayDay(e.target.value)} required />
            </div>
          ) : null}
          {fixedDate ? (
            <div className="sk-stack" style={{ marginTop: 14, gap: 8 }}>
              <span className="sk-label" id="weekend-label">If it falls on a weekend, you&apos;re paid</span>
              <div className="sk-seg sk-seg--fit" role="radiogroup" aria-labelledby="weekend-label" style={{ maxWidth: 420 }}>
                {(["before", "after", "same"] as WeekendShift[]).map((w) => (
                  <label key={w}>
                    <input type="radio" name="paydayWeekend" value={w} checked={weekend === w} onChange={() => setWeekend(w)} />
                    {weekendLabel[w]}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <input type="hidden" name="paydayWeekend" value={weekend} />
          )}
          {preview ? (
            <p className="sk-cap" style={{ marginTop: 10 }} aria-live="polite">
              Next payday: <b style={{ color: "var(--ink)" }}>{fmtWeekday(preview.date)}</b>
              {preview.movedFrom ? ` (moved from ${fmtShort(preview.movedFrom)}, a ${weekdayName(preview.movedFrom)})` : ""}
            </p>
          ) : null}
          {payday !== "weekly" ? (
            <label className="sk-between" style={{ marginTop: 14, gap: 12, cursor: "pointer", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
              <span>
                <span style={{ fontWeight: 600, display: "block" }}>Start my budget on payday</span>
                <span className="sk-cap" style={{ display: "block" }}>
                  {cycle === "payday" && cyclePreview
                    ? `Each budget runs from payday to the day before the next one. This one: ${cyclePreview}.`
                    : "Off: your budget runs from the 1st to the end of each month."}
                </span>
              </span>
              <input type="checkbox" className="sk-toggle" checked={cycle === "payday"} onChange={(e) => setCycle(e.target.checked ? "payday" : "calendar")} aria-label="Start my budget on payday" />
            </label>
          ) : null}
          <input type="hidden" name="budgetCycle" value={payday === "weekly" ? "calendar" : cycle} />
        </fieldset>

        <div className="sk-card sk-card--pad">
          <div className="sk-over" style={{ marginBottom: 2 }}>Income that varies</div>
          <p className="sk-cap" style={{ marginBottom: 6 }}>Commission, side work, allowances paid at odd times… List them here for your records.</p>
          {extras.map((e, i) => (
            <div key={i} className="sk-tx" style={{ alignItems: "flex-end" }}>
              <div className="sk-tile sk-tile--income hide-mobile">
                <Icon name="arrowDownLeft" />
              </div>
              <div className="sk-field grow">
                <label htmlFor={`en-${i}`}>Name</label>
                <input id={`en-${i}`} className="sk-input sk-input--sm" name="extraName" value={e.name} maxLength={60} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} placeholder="Side work" />
              </div>
              <div className="sk-field" style={{ width: 130 }}>
                <label htmlFor={`ea-${i}`}>Usually (GH₵, optional)</label>
                <input id={`ea-${i}`} className="sk-input sk-input--sm" name="extraAmount" inputMode="decimal" value={e.amount} maxLength={14} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} placeholder="700" />
              </div>
              <button type="button" className="sk-iconbtn" aria-label={`Remove ${e.name || "income"}`} onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                <Icon name="close" />
              </button>
            </div>
          ))}
          <button type="button" className="sk-tx sk-link" style={{ width: "100%", border: 0 }} onClick={() => setExtras([...extras, { name: "", amount: "" }])} disabled={extras.length >= 10}>
            <Icon name="plus" /> Add income that varies
          </button>
          <p className="sk-cap">We don&apos;t count these until they arrive. When one is paid, add it as income and that cycle&apos;s budget grows by the amount.</p>
        </div>
      </div>

      <aside className="sk-stack sk-setup__aside" style={{ gap: 16 }}>
        <div className="sk-card sk-card--pad sk-stack" style={{ gap: 6 }}>
          <div className="sk-over">Regular pay each month</div>
          <div className="sk-num" style={{ fontSize: 34, lineHeight: "40px" }}>
            <span className="sk-cur">GH₵</span>
            {fmt(total)}
          </div>
          <div className="sk-cap">{hasVarying ? "Plus income that varies, when it arrives" : "Your budget is planned from this"}</div>
        </div>
        <div className="sk-card sk-card--flat sk-card--pad sk-stack" style={{ gap: 6 }}>
          <b>Why we ask</b>
          <p className="sk-cap">
            Your scheme splits this number. Payday sets the &ldquo;days left&rdquo; count that &ldquo;safe to spend today&rdquo; uses.
          </p>
        </div>
        <Submit>{submitLabel}</Submit>
      </aside>
    </ActionForm>
  );
}
