import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/session";
import { fmtMonthYear, monthEnd, parseMonthParam, relDay } from "@/lib/dates";
import { cedis, parseMoney } from "@/lib/money";
import { listTransactions } from "@/lib/queries";
import { Icon } from "@/components/Icon";
import { MonthSwitch, PageHead } from "@/components/app/PageHead";
import { Empty, Tx, type TxLike } from "@/components/app/ui";

export const metadata = { title: "Transactions · FinSync" };

const FILTERS = [
  ["all", "All"],
  ["income", "Income"],
  ["expense", "Expenses"],
  ["needs", "Needs"],
  ["wants", "Wants"],
  ["savings", "Savings"],
  ["momo", "MoMo"],
  ["card", "Card"],
  ["bank", "Bank"],
  ["cash", "Cash"],
] as const;

export default async function Transactions({ searchParams }: { searchParams: Promise<{ m?: string; q?: string; f?: string; min?: string; all?: string }> }) {
  const sp = await searchParams;
  const user = await requireOnboardedUser();
  const month = parseMonthParam(sp.m);
  const q = (sp.q ?? "").trim().slice(0, 80);
  const f = FILTERS.some(([k]) => k === sp.f) ? sp.f! : "all";
  const min = sp.min ? parseMoney(sp.min) ?? undefined : undefined;
  const allTime = sp.all === "1";

  const rows = await listTransactions(user.id, {
    from: allTime ? undefined : month,
    to: allTime ? undefined : monthEnd(month),
    q: q || undefined,
    kind: f === "income" || f === "expense" ? f : undefined,
    bucket: f === "needs" || f === "wants" || f === "savings" ? f : undefined,
    method: ["momo", "card", "bank", "cash"].includes(f) ? f : undefined,
    minAmount: min,
    limit: 300,
  });

  const groups = new Map<string, TxLike[]>();
  for (const r of rows) groups.set(r.occurredOn, [...(groups.get(r.occurredOn) ?? []), r]);
  const spent = rows.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amountMinor, 0);
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { m: month.slice(0, 7), q: q || undefined, f: f !== "all" ? f : undefined, all: allTime ? "1" : undefined, ...o };
    for (const [k, val] of Object.entries(merged)) if (val) p.set(k, val);
    return `/transactions?${p}`;
  };

  return (
    <>
      <PageHead title="Transactions" back="/home" search={false} sub={allTime ? "All time" : fmtMonthYear(month)}>
        {!allTime ? <MonthSwitch month={month} base="/transactions" extra={`${q ? `&q=${encodeURIComponent(q)}` : ""}${f !== "all" ? `&f=${f}` : ""}`} /> : null}
        <a className="sk-btn sk-btn--sm sk-btn--ghost hide-mobile" href={`/api/export?from=${allTime ? "2000-01-01" : month}&to=${allTime ? "2100-12-31" : monthEnd(month)}`}>
          <Icon name="download" />Export CSV
        </a>
      </PageHead>

      <form role="search" className="sk-row" style={{ gap: 10 }}>
        <input type="hidden" name="m" value={month.slice(0, 7)} />
        {f !== "all" ? <input type="hidden" name="f" value={f} /> : null}
        <div className="sk-input grow">
          <Icon name="search" />
          <input name="q" defaultValue={q} placeholder="Search name, note or amount" aria-label="Search" maxLength={80} autoFocus={Boolean(q)} />
        </div>
        <label className="sk-row sk-cap hide-mobile" style={{ whiteSpace: "nowrap" }}>
          <input type="checkbox" name="all" value="1" defaultChecked={allTime} style={{ accentColor: "var(--brand)" }} /> All time
        </label>
        <button className="sk-btn" type="submit">Search</button>
      </form>

      <nav className="sk-chips" aria-label="Filter">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={qs({ f: k === "all" ? undefined : k })} className={`sk-chip${f === k ? " is-on" : ""}`} aria-current={f === k ? "true" : undefined}>
            {label}
          </Link>
        ))}
        {q ? <Link href={qs({ q: undefined })} className="sk-chip"><Icon name="close" />Clear search</Link> : null}
      </nav>

      {q ? (
        <div className="sk-card sk-card--pad">
          <div className="sk-between">
            <div>
              <div className="sk-over">{rows.length} result{rows.length === 1 ? "" : "s"} {allTime ? "all time" : "this month"}</div>
              <div className="sk-num" style={{ fontSize: 24 }}>GH₵ {cedis(spent, 2)}</div>
            </div>
            {rows.length ? <div className="sk-cap right">Avg GH₵ {cedis(Math.round(spent / Math.max(1, rows.filter((r) => r.kind === "expense").length)))}<br />each</div> : null}
          </div>
        </div>
      ) : null}

      <div className="sk-card sk-card--pad">
        {rows.length ? (
          [...groups].map(([day, txs]) => {
            const inn = txs.filter((t) => t.kind === "income").reduce((s, t) => s + t.amountMinor, 0);
            const out = txs.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amountMinor, 0);
            return (
              <section key={day} style={{ marginTop: 6 }}>
                <div className="sk-between" style={{ paddingTop: 8 }}>
                  <span className="sk-over">{relDay(day)}</span>
                  <span className="sk-cap">{[inn ? `+${cedis(inn, 2)}` : "", out ? `−${cedis(out, 2)}` : ""].filter(Boolean).join(" · ")}</span>
                </div>
                {txs.map((t) => (
                  <Tx key={t.id} t={t} highlight={q || undefined} meta={`${{ momo: "MoMo", card: "Card", bank: "Bank", cash: "Cash", other: "Other" }[t.method] ?? t.method} · ${t.catName ?? "Uncategorised"}`} />
                ))}
              </section>
            );
          })
        ) : (
          <Empty icon={<Icon name="search" />} title={q ? `No entries match “${q}”` : "No entries this month"}>
            {q ? "Try another word, or search all time." : "Use the gold + to log one."}
          </Empty>
        )}
      </div>
    </>
  );
}
