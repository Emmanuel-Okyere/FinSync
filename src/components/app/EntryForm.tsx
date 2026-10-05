"use client";

import { useId, useMemo, useState } from "react";
import { ActionForm, FieldError, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { addEntry, deleteEntry, updateEntry } from "@/app/(app)/_actions/transactions";

export type EntryCat = { id: string; name: string; icon: string; bucket: string; bucketName: string; kind: string; planned?: number; actual?: number };
export type EntryInit = { id: string; kind: "income" | "expense"; amount: string; categoryId: string | null; occurredOn: string; method: string; name: string; note: string | null };

const tone = (b: string) => (b === "needs" ? "needs" : b === "wants" ? "wants" : b === "savings" ? "savings" : b === "income" ? "under" : "over");
const cedi = (minor: number) => new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 }).format(Math.round(minor / 100));

export function EntryForm({
  cats,
  today,
  policies = [],
  inHousehold = false,
  initial,
  presetCategory,
}: {
  cats: EntryCat[];
  today: string;
  policies?: { id: string; name: string }[];
  inHousehold?: boolean;
  initial?: EntryInit;
  presetCategory?: string;
}) {
  const [kind, setKind] = useState<"income" | "expense">(initial?.kind ?? "expense");
  const list = useMemo(() => cats.filter((c) => c.kind === kind), [cats, kind]);
  const [catId, setCatId] = useState<string>(initial?.categoryId ?? presetCategory ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const cat = list.find((c) => c.id === catId);
  const uid = useId();
  const amt = Math.round((Number(amount.replace(/[,\s]/g, "")) || 0) * 100);

  return (
    <>
      <ActionForm action={initial ? updateEntry : addEntry} className="sk-stack" style={{ gap: 14 }} reset={!initial} onOk={() => !initial && (setAmount(""), setCatId(presetCategory ?? ""))}>
        {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
        <div className="sk-seg" role="radiogroup" aria-label="Type">
          {(["income", "expense"] as const).map((k) => (
            <label key={k}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => (setKind(k), setCatId(""))} />
              {k === "income" ? "Income" : "Expense"}
            </label>
          ))}
        </div>
        <label className="sr-only" htmlFor={`${uid}-entry-amount`}>Amount in cedis</label>
        <div className="sk-amount">
          <span className="sk-cur">GH₵</span>
          <input id={`${uid}-entry-amount`} name="amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} required maxLength={14} />
        </div>
        <FieldError name="amount" />
        {kind === "expense" && cat && cat.planned != null && amt > 0 ? (
          <div className="sk-cap" style={{ textAlign: "center", marginTop: -8 }}>
            Puts {cat.name} at{" "}
            <b className={(cat.actual ?? 0) + amt > cat.planned ? "t-expense" : "t-income"}>
              {cedi((cat.actual ?? 0) + amt)} of {cedi(cat.planned)}
            </b>
          </div>
        ) : null}
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sk-label" style={{ marginBottom: 8 }}>Category</legend>
          <div className="sk-chips sk-wrap" style={{ maxHeight: 128, overflowY: "auto" }}>
            {list.map((c) => (
              <label key={c.id} className="sk-chip">
                <input type="radio" name="categoryId" value={c.id} checked={catId === c.id} onChange={() => setCatId(c.id)} required />
                <Icon name={c.icon} />
                {c.name}
              </label>
            ))}
          </div>
          <FieldError name="categoryId" />
        </fieldset>
        <div className="sk-between">
          <span className="sk-row sk-cap">
            {cat ? (
              <>
                Counts toward <span className={`sk-tag sk-tag--${tone(cat.bucket)}`}>{cat.bucketName}</span>
              </>
            ) : (
              "Pick a category"
            )}
          </span>
          <label className="sk-row sk-cap">
            <Icon name="calendar" />
            <span className="sr-only">Date</span>
            <input type="date" name="occurredOn" defaultValue={initial?.occurredOn ?? today} max="2100-12-31" required style={{ border: 0, background: "transparent", color: "var(--ink)", fontWeight: 600 }} />
          </label>
        </div>
        <div className="sk-grid g-2" style={{ gap: 10 }}>
          <div className="sk-field">
            <label htmlFor={`${uid}-entry-name`}>Name</label>
            <input id={`${uid}-entry-name`} className="sk-input sk-input--sm" name="name" maxLength={80} defaultValue={initial?.name} placeholder={cat?.name ?? "e.g. Waakye and drinks"} />
          </div>
          <div className="sk-field">
            <label htmlFor={`${uid}-entry-method`}>Paid with</label>
            <select id={`${uid}-entry-method`} className="sk-input sk-input--sm" name="method" defaultValue={initial?.method ?? "momo"}>
              <option value="momo">MoMo</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <input className="sk-input sk-input--sm" name="note" maxLength={300} defaultValue={initial?.note ?? ""} placeholder="Note (optional)" aria-label="Note" />
        {!initial && cat?.name === "Insurance" && policies.length ? (
          <div className="sk-field">
            <label htmlFor={`${uid}-entry-policy`}>Which policy?</label>
            <select id={`${uid}-entry-policy`} className="sk-input sk-input--sm" name="policyId" defaultValue="">
              <option value="">Not linked</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {!initial && kind === "expense" ? (
          <label className="sk-between" style={{ padding: "2px 0", cursor: "pointer" }}>
            <div>
              <b>Repeat every month</b>
              <div className="sk-cap">For rent, bills and subscriptions</div>
            </div>
            <input type="checkbox" className="sk-toggle" name="repeat" />
          </label>
        ) : null}
        {!initial && kind === "expense" && inHousehold ? (
          <label className="sk-between" style={{ padding: "2px 0", cursor: "pointer" }}>
            <div>
              <b>Shared with household</b>
              <div className="sk-cap">Split equally with members</div>
            </div>
            <input type="checkbox" className="sk-toggle" name="shared" />
          </label>
        ) : null}
        <Submit className="sk-btn sk-btn--gold sk-btn--block">{initial ? "Save changes" : kind === "income" ? "Save income" : "Save expense"}</Submit>
      </ActionForm>
      {initial ? (
        <ActionForm action={deleteEntry}>
          <input type="hidden" name="id" value={initial.id} />
          <button
            type="submit"
            className="sk-btn sk-btn--danger sk-btn--block"
            onClick={(e) => {
              if (!window.confirm("Delete this entry?")) e.preventDefault();
            }}
          >
            <Icon name="trash" />
            Delete entry
          </button>
        </ActionForm>
      ) : null}
    </>
  );
}
