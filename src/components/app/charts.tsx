import { cedis } from "@/lib/money";

const TONE: Record<string, string> = { needs: "var(--brand)", wants: "var(--accent)", savings: "var(--savings)" };
export const toneColor = (key: string, i = 0) => TONE[key] ?? (i % 2 ? "var(--ink-muted)" : "var(--expense)");

/** Ring chart of actual spend per bucket. */
export function Donut({ parts, total, label }: { parts: { key: string; value: number }[]; total: number; label: string }) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const sum = Math.max(total, parts.reduce((s, p) => s + p.value, 0), 1);
  const offsets = parts.map((_, i) => parts.slice(0, i).reduce((s, p) => s + (p.value / sum) * c, 0));
  return (
    <div style={{ position: "relative", width: 150, height: 150, flex: "none" }}>
      <svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label={label}>
        <circle cx="75" cy="75" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="16" />
        {parts.map((p, i) => {
          const len = (p.value / sum) * c;
          return (
            <circle
              key={p.key}
              cx="75"
              cy="75"
              r={r}
              fill="none"
              stroke={toneColor(p.key, i)}
              strokeWidth="16"
              strokeDasharray={`${Math.max(0, len - 3)} ${c}`}
              strokeDashoffset={-offsets[i]}
              transform="rotate(-90 75 75)"
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div className="sk-num" style={{ fontSize: 22 }}>{cedis(parts.reduce((s, p) => s + p.value, 0))}</div>
          <div className="sk-cap">of {cedis(total)}</div>
        </div>
      </div>
    </div>
  );
}

/** Weekly spend vs plan bars. */
export function WeekBars({ weeks }: { weeks: { label: string; actual: number; plan: number; future: boolean }[] }) {
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.actual, w.plan)));
  return (
    <div className="sk-row" style={{ alignItems: "flex-end", gap: 0 }} role="img" aria-label={weeks.map((w) => `${w.label}: ${cedis(w.actual)} of ${cedis(w.plan)}`).join("; ")}>
      {weeks.map((w) => (
        <div key={w.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ height: 150, display: "flex", alignItems: "flex-end", gap: 5 }}>
            {w.future ? (
              <i style={{ display: "block", width: 38, height: (w.plan / max) * 140, borderRadius: 10, boxShadow: "inset 0 0 0 1.5px var(--line)", background: "repeating-linear-gradient(135deg,transparent 0 6px,var(--surface-2) 6px 9px)" }} />
            ) : (
              <>
                <i style={{ display: "block", width: 30, height: Math.max(4, (w.actual / max) * 140), borderRadius: 10, background: w.actual > w.plan * 1.1 ? "var(--accent)" : "var(--brand)" }} />
                <i style={{ display: "block", width: 10, height: Math.max(4, (w.plan / max) * 140), borderRadius: 6, background: "var(--surface-2)" }} />
              </>
            )}
          </div>
          <span className="sk-cap">{w.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Cumulative spend (solid) vs straight-line plan (dashed). */
export function PaceChart({ daily, plan, days, today }: { daily: number[]; plan: number; days: number; today: number }) {
  const W = 320, H = 140, pad = 6;
  const pts = daily.slice(0, today).map((_, i) => [i + 1, daily.slice(0, i + 1).reduce((s, x) => s + x, 0)] as const);
  const cum = pts.length ? pts[pts.length - 1][1] : 0;
  const max = Math.max(plan, cum, 1) * 1.08;
  const x = (d: number) => pad + ((d - 1) / Math.max(1, days - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const path = pts.map(([d, v], i) => `${i ? "L" : "M"}${x(d).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sk-chart" role="img" aria-label={`Spent ${cedis(cum)} by day ${today}; plan ${cedis(plan)} for the month`}>
      <line x1={x(1)} y1={y(0)} x2={x(days)} y2={y(plan)} stroke="var(--ink-faint)" strokeWidth="2" strokeDasharray="5 5" />
      {pts.length ? <path d={path} fill="none" stroke={cum > (plan * today) / days ? "var(--expense)" : "var(--brand)"} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /> : null}
      {pts.length ? <circle cx={x(pts[pts.length - 1][0])} cy={y(cum)} r="5" fill="var(--surface)" stroke={cum > (plan * today) / days ? "var(--expense)" : "var(--brand)"} strokeWidth="3" /> : null}
    </svg>
  );
}

/** Income vs spending by month. */
export function YearBars({ months }: { months: { label: string; inn: number; out: number }[] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.inn, m.out]));
  return (
    <div className="sk-bars" role="img" aria-label={months.map((m) => `${m.label}: in ${cedis(m.inn)}, out ${cedis(m.out)}`).join("; ")}>
      {months.map((m, i) => (
        <div key={i}>
          <div className="pair">
            <i style={{ height: `${(m.inn / max) * 100}%`, background: "var(--brand)" }} />
            <i style={{ height: `${(m.out / max) * 100}%`, background: "var(--accent)" }} />
          </div>
          <span className="sk-cap">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Small portfolio value line. */
export function ValueLine({ values, label }: { values: number[]; label: string }) {
  const W = 320, H = 110, pad = 6;
  if (values.length < 2) return <div className="sk-cap">Add a few values over time to see a chart.</div>;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sk-chart" role="img" aria-label={label}>
      <path d={`${d} L${x(values.length - 1)} ${H} L${x(0)} ${H} Z`} fill="var(--brand-tint)" opacity=".6" />
      <path d={d} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
