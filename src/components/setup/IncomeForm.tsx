"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import type { FormState } from "@/lib/action";
import { calculatePay } from "@/lib/paye";

type Extra = { name: string; amount: string };
const parse = (s: string) => {
  const n = Number(s.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const fmt = (n: number) => new Intl.NumberFormat("en-GH", { maximumFractionDigits: 2 }).format(n);

export function IncomeForm({
  action,
  initial,
  submitLabel = "Continue",
  returnTo,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  initial: {
    main: string;
    kind: string;
    payday: string;
    paydayDay: number | null;
    extras: Extra[];
    payslip?: { basic: string; allowances: string; tier3Pct: string } | null;
  };
  submitLabel?: string;
  returnTo?: string;
}) {
  const [netInput, setNetInput] = useState(initial.main);
  const [kind, setKind] = useState(initial.kind);
  const [mode, setMode] = useState<"net" | "gross">(initial.payslip ? "gross" : "net");
  const [basic, setBasic] = useState(initial.payslip?.basic ?? "");
  const [allowances, setAllowances] = useState(initial.payslip?.allowances ?? "");
  const [tier3, setTier3] = useState(initial.payslip?.tier3Pct ?? "");
  const gross = mode === "gross" && kind === "salary";
  const pay = gross
    ? calculatePay({ basic: Math.round(parse(basic) * 100), allowances: Math.round(parse(allowances) * 100), tier3Pct: parse(tier3), date: new Date().toISOString().slice(0, 10) })
    : null;
  const main = pay ? (parse(basic) ? (pay.net / 100).toFixed(2) : "") : netInput;
  const [payday, setPayday] = useState(initial.payday);
  const [extras, setExtras] = useState<Extra[]>(initial.extras);
  const total = parse(main) + extras.reduce((s, e) => s + parse(e.amount), 0);

  return (
    <ActionForm action={action} className="sk-setup">
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
              <div className="sk-grid g-3" style={{ gap: 10 }}>
                <div className="sk-field">
                  <label htmlFor="basic">Basic salary</label>
                  <input id="basic" className="sk-input sk-input--sm" name="basic" inputMode="decimal" value={basic} maxLength={14} onChange={(e) => setBasic(e.target.value)} placeholder="0.00" required />
                </div>
                <div className="sk-field">
                  <label htmlFor="allowances">Allowances</label>
                  <input id="allowances" className="sk-input sk-input--sm" name="allowances" inputMode="decimal" value={allowances} maxLength={14} onChange={(e) => setAllowances(e.target.value)} placeholder="0.00" />
                </div>
                <div className="sk-field">
                  <label htmlFor="tier3Pct">Tier 3 (% of basic)</label>
                  <input id="tier3Pct" className="sk-input sk-input--sm" name="tier3Pct" inputMode="decimal" value={tier3} maxLength={5} onChange={(e) => setTier3(e.target.value)} placeholder="0" />
                </div>
              </div>
              <dl className="sk-stack" style={{ gap: 6, margin: 0, fontSize: 14 }}>
                {(
                  [
                    ["Gross pay", pay.gross, ""],
                    ["SSNIT (5.5% of basic)", -pay.ssnit, ""],
                    ...(pay.tier3 ? ([["Tier 3", -pay.tier3, ""]] as const) : []),
                    ["Income tax (PAYE)", -pay.paye, ""],
                    ["Take-home", pay.net, "b"],
                  ] as const
                ).map(([k, v, b]) => (
                  <div key={k} className="sk-between" style={b ? { borderTop: "1px solid var(--line)", paddingTop: 6, fontWeight: 700 } : undefined}>
                    <dt className={b ? "" : "sk-cap"}>{k}</dt>
                    <dd style={{ margin: 0, fontVariantNumeric: "tabular-nums" }}>{v < 0 ? "−" : ""}{fmt(Math.abs(v) / 100)}</dd>
                  </div>
                ))}
              </dl>
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
              ["25th", "25th"],
              ["last_working_day", "Last working day"],
              ["weekly", "Weekly"],
              ["date", "Pick a date"],
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
              <input id="paydayDay" className="sk-input" name="paydayDay" type="number" min={1} max={31} defaultValue={initial.paydayDay ?? 28} required />
            </div>
          ) : null}
        </fieldset>

        <div className="sk-card sk-card--pad">
          <div className="sk-over" style={{ marginBottom: 6 }}>Other income</div>
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
                <label htmlFor={`ea-${i}`}>About (GH₵)</label>
                <input id={`ea-${i}`} className="sk-input sk-input--sm" name="extraAmount" inputMode="decimal" value={e.amount} maxLength={14} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} placeholder="700" />
              </div>
              <button type="button" className="sk-iconbtn" aria-label={`Remove ${e.name || "income"}`} onClick={() => setExtras(extras.filter((_, j) => j !== i))}>
                <Icon name="close" />
              </button>
            </div>
          ))}
          <button type="button" className="sk-tx sk-link" style={{ width: "100%", border: 0 }} onClick={() => setExtras([...extras, { name: "", amount: "" }])} disabled={extras.length >= 10}>
            <Icon name="plus" /> Add another income
          </button>
          <p className="sk-cap">Changes month to month? Put a typical amount; log the real one when it arrives.</p>
        </div>
      </div>

      <aside className="sk-stack" style={{ gap: 16, position: "sticky", top: 16 }}>
        <div className="sk-card sk-card--pad sk-stack" style={{ gap: 6 }}>
          <div className="sk-over">Each month</div>
          <div className="sk-num" style={{ fontSize: 34, lineHeight: "40px" }}>
            <span className="sk-cur">GH₵</span>
            {fmt(total)}
          </div>
          <div className="sk-cap">{[main && `Main ${fmt(parse(main))}`, ...extras.filter((e) => parse(e.amount)).map((e) => `${e.name || "other"} ${fmt(parse(e.amount))}`)].filter(Boolean).join(" + ")}</div>
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
