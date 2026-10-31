"use client";

import { useState } from "react";
import { ActionButton, ActionForm, FieldError, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { reviewLeftover, skipReview } from "@/app/(app)/_actions/plans";

type Option = { value: string; label: string; hint?: string };

const c2 = (m: number) => new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m / 100);

/** Payday review: what to do with what the last cycle didn't use. */
export function LeftoverReview({
  periodId,
  label,
  leftover,
  savings,
  pots,
  accounts,
}: {
  periodId: string;
  label: string;
  leftover: number;
  savings: Option[];
  pots: Option[];
  accounts: { id: string; name: string }[];
}) {
  const [to, setTo] = useState("keep");
  const [amount, setAmount] = useState((leftover / 100).toFixed(2));
  const choice = [{ value: "keep", label: "Keep it for this cycle", hint: "Adds to what you can spend now, split by your scheme" }, ...savings, ...pots].find((o) => o.value === to);
  const toSavings = savings.some((o) => o.value === to);

  return (
    <div className="sk-card sk-card--pad sk-stack" style={{ gap: 12, borderColor: "var(--brand)" }}>
      <div className="sk-row" style={{ gap: 12 }}>
        <span className="sk-tile sk-tile--savings"><Icon name="wallet" /></span>
        <div className="grow">
          <b>You finished {label} with GH₵ {c2(leftover)} unspent</b>
          <div className="sk-cap">Payday check-in: decide where it goes. You can split it, one part at a time.</div>
        </div>
        <ActionButton action={skipReview} fields={{ periodId }} className="sk-btn sk-btn--sm sk-btn--quiet">
          Leave it
        </ActionButton>
      </div>
      <ActionForm action={reviewLeftover} className="sk-stack" style={{ gap: 10 }}>
        <input type="hidden" name="periodId" value={periodId} />
        <div className="sk-chips sk-wrap" role="radiogroup" aria-label="Where the leftover goes">
          <label className="sk-chip">
            <input type="radio" name="to" value="keep" checked={to === "keep"} onChange={() => setTo("keep")} />
            Keep for this cycle
          </label>
          {savings.map((o) => (
            <label key={o.value} className="sk-chip">
              <input type="radio" name="to" value={o.value} checked={to === o.value} onChange={() => setTo(o.value)} />
              {o.label}
            </label>
          ))}
          {pots.map((o) => (
            <label key={o.value} className="sk-chip">
              <input type="radio" name="to" value={o.value} checked={to === o.value} onChange={() => setTo(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
        {choice?.hint ? <span className="sk-cap">{choice.hint}</span> : null}
        <div className="sk-row sk-wrap" style={{ gap: 10, alignItems: "flex-end" }}>
          <div className="sk-field" style={{ flex: "1 1 140px" }}>
            <label htmlFor={`lo-${periodId}`}>Amount (GH₵)</label>
            <input id={`lo-${periodId}`} className="sk-input sk-input--sm" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} maxLength={14} required />
          </div>
          {toSavings && accounts.length ? (
            <div className="sk-field" style={{ flex: "1 1 180px" }}>
              <label htmlFor={`acc-${periodId}`}>Also add to account</label>
              <select id={`acc-${periodId}`} className="sk-input sk-input--sm" name="accountId" defaultValue="">
                <option value="">Don&apos;t update an account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
        <FieldError name="amount" />
        <Submit className="sk-btn sk-btn--sm">Do it</Submit>
      </ActionForm>
    </div>
  );
}
