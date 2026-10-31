"use client";

import { useState } from "react";
import { ActionForm, Field, FieldError, Submit } from "@/components/forms";
import { saveAccountSetup } from "@/app/(app)/_actions/accounts";
import { ACCOUNT_KINDS, METHOD_LABEL, type FeeRule, type FeeRules } from "@/lib/fees";

export type AccountInit = {
  id: string;
  name: string;
  kind: string;
  last4: string | null;
  fee: FeeRule | null;
  saveToId: string | null;
  saveMinor: number;
  saveExcept: string[];
};

const f2 = (m: number) => (m / 100).toFixed(2);

/** Add / edit an account: name, kind, last 4 digits, its charge rule and its automatic saving. */
export function AccountForm({
  a,
  rules,
  savings,
  categories,
  debtCategoryId,
}: {
  a?: AccountInit;
  rules: FeeRules;
  savings: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  debtCategoryId?: string;
}) {
  const [kind, setKind] = useState(a?.kind ?? "bank");
  const [feeMode, setFeeMode] = useState(!a?.fee ? "default" : a.fee.pct === 0 ? "none" : "own");
  const [saves, setSaves] = useState(Boolean(a?.saveToId));
  const [except, setExcept] = useState<string[]>(a?.saveExcept ?? (debtCategoryId ? [debtCategoryId] : []));
  const usual = rules[kind];

  return (
    <ActionForm action={saveAccountSetup} className="sk-stack" reset={!a}>
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <Field name="name" label="Name" required defaultValue={a?.name} maxLength={40} placeholder="e.g. Stanbic current, MTN MoMo" />
      <div className="sk-grid g-2" style={{ gap: 10 }}>
        <div className="sk-field">
          <label htmlFor={`kind-${a?.id ?? "new"}`}>Type</label>
          <select id={`kind-${a?.id ?? "new"}`} className="sk-input" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {ACCOUNT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </div>
        <Field name="last4" label="Last 4 digits (optional)" inputMode="numeric" maxLength={4} defaultValue={a?.last4 ?? ""} hint="Only to tell accounts apart. Never the full number." />
      </div>

      {kind !== "cash" ? (
        <fieldset className="sk-stack" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
          <legend className="sk-label" style={{ marginBottom: 8 }}>Transfer charges</legend>
          <div className="sk-seg" role="radiogroup" aria-label="Transfer charges">
            {[
              ["default", "Usual rate"],
              ["own", "Its own rate"],
              ["none", "None"],
            ].map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="feeMode" value={v} checked={feeMode === v} onChange={() => setFeeMode(v)} />
                {l}
              </label>
            ))}
          </div>
          {feeMode === "default" ? (
            <span className="sk-cap">
              Your {METHOD_LABEL[kind] ?? kind} rule: {usual && usual.pct > 0 ? `${usual.pct}%${usual.cap ? `, max GH₵ ${f2(usual.cap)}` : ""}` : "no charge"}.
            </span>
          ) : null}
          {feeMode === "own" ? (
            <div className="sk-grid g-2" style={{ gap: 10 }}>
              <Field name="feePct" label="Charge (%)" inputMode="decimal" defaultValue={a?.fee?.pct ? String(a.fee.pct) : ""} required />
              <Field name="feeCap" label="Max (GH₵, optional)" inputMode="decimal" defaultValue={a?.fee?.cap ? f2(a.fee.cap) : ""} />
            </div>
          ) : null}
        </fieldset>
      ) : null}

      {kind !== "cash" ? (
        <div className="sk-stack" style={{ gap: 8 }}>
          <label className="sk-between" style={{ cursor: "pointer" }}>
            <div>
              <b>Saves on each payment</b>
              <div className="sk-cap">The bank moves a set amount to savings each time you pay from this account (like a lifestyle savings plan)</div>
            </div>
            <input type="checkbox" className="sk-toggle" checked={saves} onChange={(e) => setSaves(e.target.checked)} />
          </label>
          {saves ? (
            savings.length ? (
              <div className="sk-stack" style={{ gap: 10 }}>
                <div className="sk-grid g-2" style={{ gap: 10 }}>
                  <Field name="save" label="Amount each time (GH₵)" inputMode="decimal" required defaultValue={a?.saveMinor ? f2(a.saveMinor) : "100.00"} />
                  <div className="sk-field">
                    <label htmlFor={`saveTo-${a?.id ?? "new"}`}>Goes to</label>
                    <select id={`saveTo-${a?.id ?? "new"}`} className="sk-input" name="saveTo" defaultValue={a?.saveToId ?? savings[0].id}>
                      {savings.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <FieldError name="saveTo" />
                <div className="sk-field">
                  <span className="sk-label">Not on payments for</span>
                  <div className="sk-chips sk-wrap" style={{ maxHeight: 132, overflowY: "auto", padding: 2 }}>
                    {categories.map((c) => (
                      <label key={c.id} className="sk-chip">
                        <input
                          type="checkbox"
                          name="saveExcept"
                          value={c.id}
                          checked={except.includes(c.id)}
                          onChange={(e) => setExcept((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                  <span className="sk-cap">Every other payment from this account adds the saving. You can still change it on any entry.</span>
                </div>
              </div>
            ) : (
              <p className="sk-cap">Add the savings account it goes to on the Savings page first, then come back.</p>
            )
          ) : null}
        </div>
      ) : null}
      <Submit>{a ? "Save changes" : "Add account"}</Submit>
    </ActionForm>
  );
}
