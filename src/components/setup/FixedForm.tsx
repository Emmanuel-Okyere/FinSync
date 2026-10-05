"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import type { FormState } from "@/lib/action";

type Row = { name: string; categoryId: string; amount: string; day: string; on: boolean };
type Cat = { id: string; name: string; bucket: string; icon: string };
const cedi = (n: number) => new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 }).format(n);

export function FixedForm({
  action,
  cats,
  initial,
  income,
  buckets,
  submitLabel,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  cats: Cat[];
  initial: Row[];
  income: number; // minor
  buckets: { key: string; name: string; pct: number }[];
  submitLabel: string;
}) {
  const [rows, setRows] = useState<Row[]>(initial);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const amt = (r: Row) => (r.on ? Number(r.amount.replace(/[,\s]/g, "")) || 0 : 0);
  const total = rows.reduce((s, r) => s + amt(r), 0);
  const byBucket = (k: string) => rows.filter((r) => (catById.get(r.categoryId)?.bucket ?? "needs") === k).reduce((s, r) => s + amt(r), 0);
  const upd = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <ActionForm action={action} className="sk-setup">
      <div className="sk-card sk-card--pad">
        <div className="sk-tablewrap">
          <table className="sk-table">
            <thead>
              <tr>
                <th>Expense</th>
                <th className="hide-mobile">Category</th>
                <th className="r">Each month</th>
                <th className="r hide-mobile">Day</th>
                <th className="r">Include</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const c = catById.get(r.categoryId);
                return (
                  <tr key={i} style={{ opacity: r.on ? 1 : 0.6 }}>
                    <td>
                      <div className="sk-row" style={{ gap: 10 }}>
                        <span className={`sk-tile sk-tile--sm sk-tile--${c?.bucket === "wants" ? "wants" : c?.bucket === "savings" ? "savings" : "needs"} hide-mobile`}>
                          <Icon name={c?.icon ?? "tag"} />
                        </span>
                        <input aria-label="Name" className="sk-cellin" style={{ textAlign: "left", width: "100%", minWidth: 110 }} name="name" value={r.name} maxLength={60} onChange={(e) => upd(i, { name: e.target.value })} />
                      </div>
                    </td>
                    <td className="hide-mobile">
                      <select aria-label="Category" className="sk-cellin" style={{ textAlign: "left", width: 150 }} name="categoryId" value={r.categoryId} onChange={(e) => upd(i, { categoryId: e.target.value })}>
                        {cats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="r">
                      <input aria-label={`${r.name} amount`} className="sk-cellin" name="amount" inputMode="decimal" value={r.amount} maxLength={14} onChange={(e) => upd(i, { amount: e.target.value })} />
                    </td>
                    <td className="r hide-mobile">
                      <input aria-label={`${r.name} day of month`} className="sk-cellin" style={{ width: 64 }} name="day" type="number" min={1} max={31} value={r.day} onChange={(e) => upd(i, { day: e.target.value })} placeholder="–" />
                    </td>
                    <td className="r">
                      <input type="checkbox" className="sk-toggle" name="on" value={String(i)} checked={r.on} onChange={(e) => upd(i, { on: e.target.checked })} aria-label={`Include ${r.name}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="sk-tx sk-link" style={{ border: 0 }} disabled={rows.length >= 40} onClick={() => setRows([...rows, { name: "", categoryId: cats.find((c) => c.bucket === "needs")?.id ?? cats[0].id, amount: "", day: "", on: true }])}>
          <Icon name="plus" /> Add another
        </button>
      </div>
      <aside className="sk-stack" style={{ position: "sticky", top: 16 }}>
        <div className="sk-card sk-card--pad sk-stack" style={{ gap: 6 }}>
          <div className="sk-over">Leaves every month</div>
          <div className="sk-num" style={{ fontSize: 34, lineHeight: "40px" }}>
            <span className="sk-cur">GH₵</span>
            {cedi(total)}
          </div>
          <div className="sk-cap">{income ? Math.round((total * 10000) / income) : 0}% of your pay, added to each budget on the 1st</div>
        </div>
        <div className="sk-card sk-card--flat sk-card--pad sk-stack" style={{ gap: 8 }}>
          <div className="sk-over">After fixed costs</div>
          {buckets.map((b) => (
            <div key={b.key} className="sk-between">
              <span>{b.name} left</span>
              <b>GH₵ {cedi((income * b.pct) / 10000 - byBucket(b.key))}</b>
            </div>
          ))}
        </div>
        <Submit>{submitLabel}</Submit>
      </aside>
    </ActionForm>
  );
}
