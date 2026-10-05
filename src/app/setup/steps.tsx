"use client";

import { usePathname } from "next/navigation";

const STEPS = [
  ["income", "Income"],
  ["scheme", "Scheme"],
  ["fixed", "Fixed expenses"],
] as const;

export function StepNav() {
  const path = usePathname();
  const idx = STEPS.findIndex(([k]) => path.endsWith(k));
  return (
    <ol className="sk-row hide-mobile" style={{ listStyle: "none", margin: 0, padding: 0, gap: 20 }} aria-label="Setup steps">
      {STEPS.map(([k, label], i) => (
        <li key={k} className="sk-row" style={{ gap: 8, fontWeight: 600, color: i <= idx ? "var(--ink)" : "var(--ink-muted)" }} aria-current={i === idx ? "step" : undefined}>
          <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, background: i < idx ? "var(--brand)" : i === idx ? "var(--brand-tint)" : "var(--surface-2)", color: i < idx ? "var(--on-brand)" : "var(--brand-strong)" }}>
            {i < idx ? "✓" : i + 1}
          </span>
          {label}
        </li>
      ))}
    </ol>
  );
}

export function StepHead({ n, title, lead }: { n: number; title: string; lead: string }) {
  return (
    <div className="sk-stack" style={{ gap: 6, marginBottom: 20 }}>
      <div className="sk-row" style={{ gap: 12 }}>
        <div className="sk-steps" aria-hidden>
          {[1, 2, 3].map((i) => (
            <i key={i} className={i <= n ? "is-on" : ""} />
          ))}
        </div>
        <span className="sk-cap">Step {n} of 3</span>
      </div>
      <h1 className="sk-title" style={{ fontSize: 30, lineHeight: "36px" }}>{title}</h1>
      <p className="sk-muted">{lead}</p>
    </div>
  );
}
