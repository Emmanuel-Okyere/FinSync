"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import type { FormState } from "@/lib/action";

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
  initial: { main: string; kind: string; payday: string; paydayDay: number | null; extras: Extra[] };
  submitLabel?: string;
  returnTo?: string;
}) {
  const [main, setMain] = useState(initial.main);
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
            <input id="main" name="main" inputMode="decimal" autoComplete="off" placeholder="0" value={main} onChange={(e) => setMain(e.target.value)} required maxLength={14} />
          </div>
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
                  <input type="radio" name="kind" value={v} defaultChecked={initial.kind === v} />
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
