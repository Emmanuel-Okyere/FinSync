import { cedis } from "@/lib/money";
import { bucketTone } from "@/lib/schemes";
import { relDay } from "@/lib/dates";
import type { EntryInit } from "./EntryForm";
import { TxRow } from "./AddEntry";

export function Amount({ minor, decimals = 0, className = "", style }: { minor: number; decimals?: 0 | 2; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`sk-num ${className}`} style={style}>
      <span className="sk-cur">GH₵</span>
      {minor < 0 ? "−" : ""}
      {cedis(Math.abs(minor), decimals)}
    </span>
  );
}

export function Bar({ value, max, tone = "needs", marker, thin, hero }: { value: number; max: number; tone?: string; marker?: number; thin?: boolean; hero?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  const t = bucketTone(tone);
  const cls = ["sk-bar", hero ? "sk-bar--hero" : t === "wants" ? "sk-bar--wants" : t === "savings" ? "sk-bar--savings" : "", value > max && max >= 0 && !hero ? "sk-bar--over" : "", thin ? "sk-bar--thin" : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(max / 100)} aria-valuenow={Math.round(value / 100)}>
      <i style={{ width: `${pct}%` }} />
      {marker != null ? <b style={{ left: `${Math.min(100, marker * 100)}%` }} /> : null}
    </div>
  );
}

export const toneClass = (key: string) => bucketTone(key);

export function DiffTag({ planned, actual, done }: { planned: number; actual: number; done?: boolean }) {
  const diff = planned - actual;
  if (actual > planned) return <span className="sk-tag sk-tag--over">{cedis(-diff)} over</span>;
  if (diff === 0 || (done && diff === 0)) return <span className="sk-tag sk-tag--needs">on plan</span>;
  if (done) return <span className="sk-tag sk-tag--under">{cedis(diff)} under</span>;
  return <span className="sk-tag sk-tag--needs">{cedis(diff)} left</span>;
}

export const METHOD_LABEL: Record<string, string> = { momo: "MoMo", card: "Card", bank: "Bank", cash: "Cash", other: "Other" };

export type TxLike = {
  id: string;
  kind: string;
  amountMinor: number;
  name: string;
  note: string | null;
  method: string;
  occurredOn: string;
  categoryId: string | null;
  catName: string | null;
  catIcon: string | null;
  catBucket: string | null;
};

export function txTone(t: TxLike) {
  if (t.kind === "income") return "income";
  const b = t.catBucket ?? "needs";
  return b === "wants" ? "wants" : b === "savings" ? "savings" : b === "needs" ? "needs" : "over";
}

export function Tx({ t, meta, highlight }: { t: TxLike; meta?: string; highlight?: string }) {
  const entry: EntryInit = {
    id: t.id,
    kind: t.kind as "income" | "expense",
    amount: (t.amountMinor / 100).toFixed(2),
    categoryId: t.categoryId,
    occurredOn: t.occurredOn,
    method: t.method,
    name: t.name,
    note: t.note,
  };
  return (
    <TxRow
      entry={entry}
      icon={t.catIcon ?? (t.kind === "income" ? "arrowDownLeft" : "tag")}
      tone={txTone(t)}
      meta={meta ?? `${relDay(t.occurredOn)} · ${t.catName ?? METHOD_LABEL[t.method] ?? ""}`}
      amountText={`${t.kind === "income" ? "+" : "−"}${cedis(t.amountMinor, 2)}`}
      amountClass={t.kind === "income" ? "t-income" : ""}
      highlight={highlight}
    />
  );
}

export function Empty({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="sk-empty">
      {icon}
      <b>{title}</b>
      {children ? <div className="sk-cap">{children}</div> : null}
    </div>
  );
}
