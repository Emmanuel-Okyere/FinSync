"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ActionButton, ActionForm, Dialog, Field, Submit, useServerAction } from "@/components/forms";
import { AddToLineButton, useFeeRules } from "@/components/app/AddEntry";
import { ChargeField } from "@/components/ChargeField";
import { PAYMENT_METHODS } from "@/lib/fees";
import { markLinePaid, removeLine, reopenLine, setLinePlanned } from "@/app/(app)/_actions/budget";
import type { LineView } from "@/lib/budget";

const c0 = (m: number) => new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 }).format(Math.round(m / 100));
const c2 = (m: number) => new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m / 100);
const tone = (b: string) => (b === "wants" ? "wants" : b === "savings" ? "savings" : b === "needs" ? "needs" : "over");

function Diff({ l }: { l: LineView }) {
  const d = l.planned - l.actual;
  if (l.actual > l.planned) return <span className="sk-tag sk-tag--over">{c0(-d)} over</span>;
  if (d === 0) return <span className="sk-tag sk-tag--needs">on plan</span>;
  if (l.done) return <span className="sk-tag sk-tag--under">{c0(d)} under</span>;
  return <span className="sk-tag sk-tag--needs">{c0(d)} left</span>;
}

/** Tick = "paid / done for this cycle". Ticking asks what you paid and records it; unticking keeps every entry. */
function Check({ l, defaultDate }: { l: LineView; defaultDate: string }) {
  if (l.done) {
    return (
      <ActionButton action={reopenLine} fields={{ id: l.id }} className="sk-check is-on" ariaLabel={`Reopen ${l.name}`}>
        <Icon name="check" />
      </ActionButton>
    );
  }
  return (
    <Dialog label={null} ariaLabel={`Mark ${l.name} paid`} title={`Mark ${l.name} paid`} triggerClassName="sk-check">
      <MarkPaidForm l={l} defaultDate={defaultDate} />
    </Dialog>
  );
}

function MarkPaidForm({ l, defaultDate }: { l: LineView; defaultDate: string }) {
  const rules = useFeeRules();
  const remaining = Math.max(0, l.planned - l.actual);
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [method, setMethod] = useState(l.method ?? "momo");
  const amt = Math.round((Number(amount.replace(/[,\s]/g, "")) || 0) * 100);
  return (
      <ActionForm action={markLinePaid} className="sk-stack">
        <input type="hidden" name="id" value={l.id} />
        <p className="sk-muted">
          {l.actual > 0
            ? `You've logged GH₵ ${c2(l.actual)} of GH₵ ${c2(l.planned)} so far.`
            : `Planned: GH₵ ${c2(l.planned)}. Nothing logged yet.`}{" "}
          Enter anything still to record, or leave it at 0 to just mark it done.
        </p>
        <div className="sk-grid g-2" style={{ gap: 10 }}>
          <div className="sk-field">
            <label htmlFor={`paid-${l.id}`}>Paid now (GH₵)</label>
            <input id={`paid-${l.id}`} className="sk-input" name="amount" inputMode="decimal" value={amount} maxLength={14} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Field name="date" label="Date" type="date" defaultValue={defaultDate} />
        </div>
        <div className="sk-field">
          <label htmlFor={`method-${l.id}`}>Paid with</label>
          <select id={`method-${l.id}`} className="sk-input" name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        {amt > 0 && l.name !== "Transfer charges" ? <ChargeField amount={amt} method={method} rules={rules} initialFee={l.noCharge ? 0 : undefined} /> : null}
        <Submit>Mark paid</Submit>
      </ActionForm>
  );
}

/** Actual = everything logged under the line; "+" adds more. */
function ActualCell({ l, defaultDate }: { l: LineView; defaultDate: string }) {
  return (
    <span className="sk-row" style={{ gap: 8, justifyContent: "flex-end" }}>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{c2(l.actual)}</span>
      <AddToLineButton categoryId={l.categoryId} name={l.name} defaultDate={defaultDate} />
    </span>
  );
}

/** Inline money cell that saves on blur / Enter. */
function MoneyCell({ l, field }: { l: LineView; field: "planned" }) {
  const action = setLinePlanned;
  const [state, run, pending] = useServerAction(action, { toastError: true });
  const initial = (l[field] / 100).toFixed(2);
  const [val, setVal] = useState(initial);
  return (
    <form
      style={{ display: "inline" }}
      onSubmit={(e) => {
        e.preventDefault();
        run(new FormData(e.currentTarget));
      }}
    >
      <input type="hidden" name="id" value={l.id} />
      <input
        className="sk-cellin"
        name={field}
        inputMode="decimal"
        value={val}
        aria-label={`${l.name} ${field}`}
        aria-invalid={state.error ? true : undefined}
        title={state.error}
        disabled={pending}
        maxLength={14}
        onChange={(e) => setVal(e.target.value)}
        onBlur={(e) => {
          if (val !== initial) e.currentTarget.form?.requestSubmit();
        }}
      />
    </form>
  );
}

export function BudgetTable({ lines, bucketNames, defaultDate }: { lines: LineView[]; bucketNames: Record<string, string>; defaultDate: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {/* Desktop: editable table */}
      <div className="sk-tablewrap hide-mobile">
        <table className="sk-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}><span className="sr-only">Paid</span></th>
              <th>Line</th>
              <th>Bucket</th>
              <th className="r">Planned</th>
              <th className="r">Actual</th>
              <th className="r">Difference</th>
              <th><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className={l.done ? "is-done" : ""}>
                <td><Check l={l} defaultDate={defaultDate} /></td>
                <td className="nm">
                  <span className="sk-row" style={{ gap: 10 }}>
                    <span className={`sk-tile sk-tile--sm sk-tile--${tone(l.bucket)}`}><Icon name={l.icon} /></span>
                    <span>
                      <b style={{ fontWeight: 600 }}>{l.name}</b>
                      <div className="sk-cap">{l.fixed ? "Fixed" : `${l.entries} entr${l.entries === 1 ? "y" : "ies"}`}</div>
                    </span>
                  </span>
                </td>
                <td><span className={`sk-tag sk-tag--${tone(l.bucket)}`}>{bucketNames[l.bucket] ?? l.bucket}</span></td>
                <td className="r"><MoneyCell key={`p-${l.planned}`} l={l} field="planned" /></td>
                <td className="r"><ActualCell l={l} defaultDate={defaultDate} /></td>
                <td className="r"><Diff l={l} /></td>
                <td className="r">
                  <ActionButton action={removeLine} fields={{ id: l.id }} className="sk-iconbtn" ariaLabel={`Remove ${l.name} from this month`} confirm={{ title: `Remove ${l.name} from this month?`, body: "Its entries stay in your transactions; only the plan line goes.", confirmLabel: "Remove", danger: true }}>
                    <Icon name="trash" />
                  </ActionButton>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Total</td>
              <td />
              <td className="r">{c2(lines.reduce((s, l) => s + l.planned, 0))}</td>
              <td className="r">{c2(lines.reduce((s, l) => s + l.actual, 0))}</td>
              <td className="r" />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phone: tap a line to change its plan; "+" logs spending into it */}
      <div className="hide-desktop">
        {lines.map((l) =>
          open === l.id ? (
            <div key={l.id} className="sk-bl" style={{ display: "block", background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: 12, margin: "4px -8px" }}>
              <div className="sk-row">
                <Check l={l} defaultDate={defaultDate} />
                <div className="sk-bl__main">
                  <div className="sk-bl__name">{l.name}</div>
                  <div className="sk-cap">Change the plan any time this cycle</div>
                </div>
                <button type="button" className="sk-iconbtn" style={{ width: 34, height: 34 }} aria-label="Close" onClick={() => setOpen(null)}>
                  <Icon name="close" />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <div className="sk-mini"><small>Planned</small><MoneyCell key={`p-${l.planned}`} l={l} field="planned" /></div>
                <div className="sk-mini"><small>Spent so far</small><b>{c2(l.actual)}</b></div>
              </div>
              <div className="sk-between" style={{ marginTop: 10 }}>
                <Diff l={l} />
                <span className="sk-row" style={{ gap: 8 }}>
                  <AddToLineButton categoryId={l.categoryId} name={l.name} defaultDate={defaultDate} />
                  <button type="button" className="sk-btn sk-btn--sm" onClick={() => setOpen(null)}>Done</button>
                </span>
              </div>
            </div>
          ) : (
            <div key={l.id} className={`sk-bl${l.done ? " is-done" : ""}`}>
              <Check l={l} defaultDate={defaultDate} />
              <button type="button" className="sk-bl__main" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setOpen(l.id)} aria-label={`Edit ${l.name}`}>
                <div className="sk-bl__name">{l.name}</div>
                <div className="sk-row" style={{ marginTop: 2 }}>
                  <Diff l={l} />
                  <span className="sk-cap">{l.fixed ? "Fixed" : `${l.entries} entr${l.entries === 1 ? "y" : "ies"}`}</span>
                </div>
              </button>
              <div className="sk-bl__nums">
                <div className="sk-bl__act">{c0(l.actual)}</div>
                <div className="sk-bl__plan">of {c0(l.planned)}</div>
              </div>
              <AddToLineButton categoryId={l.categoryId} name={l.name} defaultDate={defaultDate} />
            </div>
          ),
        )}
      </div>
    </>
  );
}
