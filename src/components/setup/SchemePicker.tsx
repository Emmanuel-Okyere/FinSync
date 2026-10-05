"use client";

import { useState } from "react";
import { ActionForm, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import type { FormState } from "@/lib/action";
import type { Bucket, Scheme } from "@/db/schema";

type Preset = Scheme & { blurb: string; source: string };
const TONES = ["var(--brand)", "var(--accent)", "var(--savings)", "var(--expense)", "var(--ink-muted)"];
const toneOf = (b: Bucket, i: number) =>
  b.key === "needs" ? TONES[0] : b.key === "wants" ? TONES[1] : b.key === "savings" ? TONES[2] : TONES[3 + (i % 2)];
const cedi = (minor: number) => new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 }).format(Math.round(minor / 100));

export function SchemePicker({
  action,
  presets,
  current,
  income,
  submit,
  extra,
  showSources = false,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  presets: Preset[];
  current: Scheme | null;
  income: number;
  submit: React.ReactNode;
  extra?: React.ReactNode;
  showSources?: boolean;
}) {
  const [sel, setSel] = useState(current?.id ?? presets[0].id);
  const [custom, setCustom] = useState<Bucket[]>(
    current?.id === "custom"
      ? current.buckets
      : [
          { key: "needs", name: "Needs", pct: 55 },
          { key: "wants", name: "Wants", pct: 25 },
          { key: "savings", name: "Savings", pct: 20 },
        ],
  );
  const active = sel === "custom" ? custom : presets.find((p) => p.id === sel)!.buckets;
  const total = custom.reduce((s, b) => s + (Number(b.pct) || 0), 0);

  return (
    <ActionForm action={action} className="sk-setup">
      <div className="sk-stack" role="radiogroup" aria-label="Scheme">
        {presets.map((p) => (
          <label key={p.id} className="sk-scheme">
            <input type="radio" name="scheme" value={p.id} checked={sel === p.id} onChange={() => setSel(p.id)} />
            <div className="sk-between">
              <span className="sk-scheme__name">{p.name}</span>
              <span className="sk-radio" />
            </div>
            <div className="sk-stackbar">
              {p.buckets.map((b, i) => (
                <i key={b.key} style={{ flex: b.pct, background: toneOf(b, i) }} />
              ))}
            </div>
            <div className="sk-cap">{p.blurb}</div>
            {showSources ? <div className="sk-cap" style={{ fontSize: 12 }}>Source: {p.source}</div> : null}
          </label>
        ))}
        <label className="sk-scheme">
          <input type="radio" name="scheme" value="custom" checked={sel === "custom"} onChange={() => setSel("custom")} />
          <div className="sk-row" style={{ gap: 12 }}>
            <span className="sk-tile"><Icon name="sliders" /></span>
            <div className="grow">
              <b>Make your own</b>
              <div className="sk-cap">Two to five buckets, your percentages</div>
            </div>
            <span className="sk-radio" />
          </div>
        </label>
        {sel === "custom" ? (
          <div className="sk-card sk-card--pad sk-stack">
            {custom.map((b, i) => (
              <div key={i} className="sk-row" style={{ gap: 10 }}>
                <i className="sk-dot" style={{ background: toneOf(b, i) }} />
                <input aria-label="Bucket name" className="sk-input sk-input--sm grow" name="bucketName" value={b.name} maxLength={30} readOnly={b.key === "savings"} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, name: e.target.value, key: e.target.value.toLowerCase() } : x)))} />
                <div className="sk-input sk-input--sm" style={{ width: 96 }}>
                  <input aria-label={`${b.name} percent`} name="bucketPct" inputMode="numeric" value={b.pct} maxLength={3} onChange={(e) => setCustom(custom.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} />
                  %
                </div>
                {b.key !== "savings" && custom.length > 2 ? (
                  <button type="button" className="sk-iconbtn" aria-label={`Remove ${b.name}`} onClick={() => setCustom(custom.filter((_, j) => j !== i))}>
                    <Icon name="close" />
                  </button>
                ) : (
                  <span style={{ width: 40 }} />
                )}
              </div>
            ))}
            <div className="sk-between">
              <button type="button" className="sk-link" disabled={custom.length >= 5} onClick={() => setCustom([...custom.slice(0, -1), { key: `extra${custom.length}`, name: "Giving", pct: 0 }, custom[custom.length - 1]])}>
                + Add a bucket (debt, giving, investing)
              </button>
              <b className={total === 100 ? "t-income" : "t-expense"}>{total}%</b>
            </div>
          </div>
        ) : null}
      </div>
      <aside className="sk-stack" style={{ position: "sticky", top: 16 }}>
        <div className="sk-card sk-card--pad sk-stack">
          <div className="sk-between">
            <b className="sk-h">Your split</b>
            <span className="sk-cap">GH₵ {cedi(income)} a month</span>
          </div>
          {active.map((b, i) => (
            <div key={i} className="sk-between">
              <span className="sk-row">
                <i className="sk-dot" style={{ background: toneOf(b, i) }} />
                {b.name}
              </span>
              <b className="sk-num">GH₵ {cedi((income * (Number(b.pct) || 0)) / 100)}</b>
            </div>
          ))}
          <p className="sk-cap">You can switch schemes any month.</p>
        </div>
        {extra}
        {submit}
      </aside>
    </ActionForm>
  );
}

export { Submit };
