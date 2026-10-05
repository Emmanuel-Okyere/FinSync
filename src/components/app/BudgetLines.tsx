"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/Icon";
import { ActionButton } from "@/components/forms";
import { removeLine, setLineActual, setLinePlanned, toggleLine } from "@/app/(app)/_actions/budget";
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

function Check({ l }: { l: LineView }) {
  return (
    <ActionButton action={toggleLine} fields={{ id: l.id }} className={`sk-check${l.done ? " is-on" : ""}`} ariaLabel={l.done ? `Reopen ${l.name}` : `Strike off ${l.name}`}>
      {l.done ? <Icon name="check" /> : null}
    </ActionButton>
  );
}

/** Inline money cell that saves on blur / Enter. */
function MoneyCell({ l, field }: { l: LineView; field: "planned" | "actual" }) {
  const action = field === "planned" ? setLinePlanned : setLineActual;
  const [state, formAction, pending] = useActionState(action, {});
  const initial = (l[field] / 100).toFixed(2);
  const [val, setVal] = useState(initial);
  return (
    <form action={formAction} style={{ display: "inline" }}>
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
      {state.error ? <div className="sk-err" role="alert" style={{ fontSize: 12 }}>{state.error}</div> : null}
    </form>
  );
}

export function BudgetTable({ lines, bucketNames }: { lines: LineView[]; bucketNames: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      {/* Desktop: editable table */}
      <div className="sk-tablewrap hide-mobile">
        <table className="sk-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}><span className="sr-only">Done</span></th>
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
                <td><Check l={l} /></td>
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
                <td className="r"><MoneyCell key={`a-${l.actual}`} l={l} field="actual" /></td>
                <td className="r"><Diff l={l} /></td>
                <td className="r">
                  <ActionButton action={removeLine} fields={{ id: l.id }} className="sk-iconbtn" ariaLabel={`Remove ${l.name} from this month`} confirm={`Remove ${l.name} from this month? Its entries stay.`}>
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

      {/* Phone: strike-off list, tap to open */}
      <div className="hide-desktop">
        {lines.map((l) =>
          open === l.id ? (
            <div key={l.id} className="sk-bl" style={{ display: "block", background: "var(--surface-2)", borderRadius: "var(--radius-md)", padding: 12, margin: "4px -8px" }}>
              <div className="sk-row">
                <Check l={l} />
                <div className="sk-bl__main">
                  <div className="sk-bl__name">{l.name}</div>
                  <div className="sk-cap">Paid more or less than planned?</div>
                </div>
                <button type="button" className="sk-iconbtn" style={{ width: 34, height: 34 }} aria-label="Close" onClick={() => setOpen(null)}>
                  <Icon name="close" />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                <div className="sk-mini"><small>Planned</small><MoneyCell key={`p-${l.planned}`} l={l} field="planned" /></div>
                <div className="sk-mini"><small>Actual</small><MoneyCell key={`a-${l.actual}`} l={l} field="actual" /></div>
              </div>
              <div className="sk-between" style={{ marginTop: 10 }}>
                <Diff l={l} />
                <button type="button" className="sk-btn sk-btn--sm" onClick={() => setOpen(null)}>Done</button>
              </div>
            </div>
          ) : (
            <div key={l.id} className={`sk-bl${l.done ? " is-done" : ""}`}>
              <Check l={l} />
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
            </div>
          ),
        )}
      </div>
    </>
  );
}
