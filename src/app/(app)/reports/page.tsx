import Link from "next/link";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgetLines, budgetMonths, categories, transactions } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { monthView } from "@/lib/budget";
import { addMonths, fmtMonthYear, monthStart, parseMonthParam, todayISO } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { listTransactions } from "@/lib/queries";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { YearBars } from "@/components/app/charts";
import { Amount, Bar, Empty, METHOD_LABEL } from "@/components/app/ui";

export const metadata = { title: "Reports · FinSync" };

const tile = (b: string) => (b === "wants" ? "wants" : b === "savings" ? "savings" : "needs");

export default async function Reports({ searchParams }: { searchParams: Promise<{ view?: string; m?: string; y?: string }> }) {
  const sp = await searchParams;
  const user = await requireOnboardedUser();
  const view = sp.view === "year" ? "year" : "month";
  const today = todayISO();

  const Seg = (
    <nav className="sk-seg" style={{ width: 220 }} aria-label="Report period">
      <Link href="/reports" className={view === "month" ? "is-on" : ""}>Month</Link>
      <Link href="/reports?view=year" className={view === "year" ? "is-on" : ""}>Year</Link>
    </nav>
  );

  if (view === "month") {
    const month = sp.m ? parseMonthParam(sp.m) : addMonths(monthStart(today), -1);
    const v = await monthView(user, month);
    const inn = v.income + v.extraIncome;
    const out = v.totalActual - v.saved;
    const savePct = inn ? (v.saved / inn) * 100 : 0;
    const target = v.scheme.buckets.find((b) => b.key === "savings")?.pct ?? 0;
    const biggest = [...v.lines].filter((l) => l.bucket !== "savings").sort((a, b) => b.actual - a.actual).slice(0, 6);
    return (
      <>
        <PageHead title="Reports" sub={fmtMonthYear(month)}>
          {Seg}
        </PageHead>
        <div className="sk-between" style={{ maxWidth: 520 }}>
          <Link className="sk-iconbtn" href={`/reports?m=${addMonths(month, -1).slice(0, 7)}`} aria-label="Previous month"><Icon name="back" /></Link>
          <b>{fmtMonthYear(month)}</b>
          <Link className="sk-iconbtn" href={`/reports?m=${addMonths(month, 1).slice(0, 7)}`} aria-label="Next month"><Icon name="next" /></Link>
        </div>
        <div className="sk-grid g-2">
          <div className="sk-card sk-card--pad sk-stack">
            <div className="sk-grid g-3" style={{ gap: 12 }}>
              <div><div className="sk-over">In</div><div className="sk-num t-income" style={{ fontSize: 24 }}>{cedis(inn)}</div></div>
              <div><div className="sk-over">Out</div><div className="sk-num" style={{ fontSize: 24 }}>{cedis(out)}</div></div>
              <div><div className="sk-over">Saved</div><div className="sk-num t-sav" style={{ fontSize: 24 }}>{cedis(v.saved)}</div></div>
            </div>
            <div className={`sk-row ${savePct >= target ? "t-income" : "t-warn"}`} style={{ fontWeight: 600 }}>
              <Icon name={savePct >= target ? "check" : "bell"} />
              Saved {savePct.toFixed(1)}% · {savePct >= target ? "scheme target met" : `target ${target}%`}
            </div>
            <div className="sk-cap">In = planned pay (GH₵ {cedis(v.income)}) plus extra income you logged.</div>
          </div>
          <div className="sk-card sk-card--pad sk-stack">
            <b>Biggest categories</b>
            {biggest.length ? (
              biggest.map((l) => (
                <div key={l.id} className="sk-stack" style={{ gap: 6 }}>
                  <div className="sk-between">
                    <span className="sk-row"><span className={`sk-tile sk-tile--sm sk-tile--${tile(l.bucket)}`}><Icon name={l.icon} /></span><b>{l.name}</b></span>
                    <span><b>{cedis(l.actual)}</b> <span className="sk-cap">/ {cedis(l.planned)}</span></span>
                  </div>
                  <Bar value={l.actual} max={l.planned} tone={l.bucket} thin />
                </div>
              ))
            ) : (
              <Empty title="Nothing spent this month" />
            )}
          </div>
        </div>
      </>
    );
  }

  const year = /^\d{4}$/.test(sp.y ?? "") ? Number(sp.y) : Number(today.slice(0, 4));
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [monthsRows, totals, catRows, planRows, debtPaid, recent] = await Promise.all([
    db.select().from(budgetMonths).where(and(eq(budgetMonths.userId, user.id), gte(budgetMonths.month, from), lte(budgetMonths.month, to))),
    db
      .select({ m: sql<string>`to_char(${transactions.occurredOn}, 'MM')`, kind: transactions.kind, bucket: categories.bucket, total: sql<string>`sum(${transactions.amountMinor})` })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(eq(transactions.userId, user.id), gte(transactions.occurredOn, from), lte(transactions.occurredOn, to)))
      .groupBy(sql`1`, transactions.kind, categories.bucket),
    db
      .select({ id: categories.id, name: categories.name, icon: categories.icon, bucket: categories.bucket, total: sql<string>`sum(${transactions.amountMinor})` })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(eq(transactions.userId, user.id), eq(transactions.kind, "expense"), gte(transactions.occurredOn, from), lte(transactions.occurredOn, to)))
      .groupBy(categories.id),
    db
      .select({ categoryId: budgetLines.categoryId, planned: sql<string>`sum(${budgetLines.plannedMinor})` })
      .from(budgetLines)
      .innerJoin(budgetMonths, eq(budgetMonths.id, budgetLines.monthId))
      .where(and(eq(budgetLines.userId, user.id), gte(budgetMonths.month, from), lte(budgetMonths.month, to)))
      .groupBy(budgetLines.categoryId),
    db
      .select({ total: sql<string>`coalesce(sum(${transactions.amountMinor}),0)` })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(eq(transactions.userId, user.id), eq(categories.name, "Debt repayment"), gte(transactions.occurredOn, from), lte(transactions.occurredOn, to))),
    listTransactions(user.id, { from, to, limit: 8 }),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const planned = monthsRows.find((r) => r.month.slice(5, 7) === mm)?.incomeMinor ?? 0;
    const extra = totals.filter((t) => t.m === mm && t.kind === "income").reduce((s, t) => s + Number(t.total), 0);
    const out = totals.filter((t) => t.m === mm && t.kind === "expense" && t.bucket !== "savings").reduce((s, t) => s + Number(t.total), 0);
    const saved = totals.filter((t) => t.m === mm && t.kind === "expense" && t.bucket === "savings").reduce((s, t) => s + Number(t.total), 0);
    return { label: "JFMAMJJASOND"[i], inn: planned + extra, out, saved };
  });
  const inn = months.reduce((s, m) => s + m.inn, 0);
  const out = months.reduce((s, m) => s + m.out, 0);
  const saved = months.reduce((s, m) => s + m.saved, 0);
  const active = months.filter((m) => m.inn || m.out).length || 1;
  const plan = new Map(planRows.map((p) => [p.categoryId, Number(p.planned)]));
  const where = catRows
    .filter((c) => c.bucket !== "savings")
    .map((c) => ({ ...c, total: Number(c.total), plan: plan.get(c.id) ?? 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  return (
    <>
      <PageHead title="Reports" sub={`January to ${year === Number(today.slice(0, 4)) ? fmtMonthYear(today).split(" ")[0] : "December"} ${year}`}>
        {Seg}
        <nav className="sk-row" aria-label="Year">
          <Link className="sk-iconbtn" href={`/reports?view=year&y=${year - 1}`} aria-label="Previous year"><Icon name="back" /></Link>
          <b>{year}</b>
          <Link className="sk-iconbtn" href={`/reports?view=year&y=${year + 1}`} aria-label="Next year"><Icon name="next" /></Link>
        </nav>
        <a className="sk-btn sk-btn--sm sk-btn--ghost hide-mobile" href={`/api/export?from=${from}&to=${to}`}><Icon name="download" />Export CSV</a>
      </PageHead>
      <div className="sk-hero hide-desktop">
        <div className="sk-hero__deco" />
        <div className="sk-over">Saved in {year} so far</div>
        <Amount minor={saved} style={{ fontSize: 40, lineHeight: "44px" }} />
        <div className="sk-cap">{inn ? ((saved / inn) * 100).toFixed(1) : 0}% of income</div>
      </div>
      <div className="sk-grid g-4 hide-mobile">
        <div className="sk-kpi"><div className="sk-over">Income</div><Amount minor={inn} className="t-income" /><div className="sk-cap">Avg {cedis(inn / active)} a month</div></div>
        <div className="sk-kpi"><div className="sk-over">Spent</div><Amount minor={out} /><div className="sk-cap">Avg {cedis(out / active)} a month</div></div>
        <div className="sk-kpi"><div className="sk-over">Saved</div><Amount minor={saved} className="t-sav" /><div className="sk-cap">{inn ? ((saved / inn) * 100).toFixed(1) : 0}% of income</div></div>
        <div className="sk-kpi"><div className="sk-over">Debt paid</div><Amount minor={Number(debtPaid[0]?.total ?? 0)} /><div className="sk-cap">Logged as Debt repayment</div></div>
      </div>
      <div className="sk-grid g-main">
        <div className="sk-card sk-card--pad sk-stack">
          <div className="sk-between">
            <b className="sk-h">Income and spending by month</b>
            <span className="sk-row sk-cap" style={{ gap: 12 }}>
              <span className="sk-row"><i className="sk-dot b-needs" />In</span>
              <span className="sk-row"><i className="sk-dot b-wants" />Out</span>
            </span>
          </div>
          <YearBars months={months} />
        </div>
        <div className="sk-card sk-card--pad sk-stack">
          <div>
            <b className="sk-h">Where it went</b>
            <div className="sk-cap">Against plan, year to date</div>
          </div>
          {where.length ? (
            where.map((c) => (
              <div key={c.id} className="sk-stack" style={{ gap: 6 }}>
                <div className="sk-between">
                  <span className="sk-row"><span className={`sk-tile sk-tile--sm sk-tile--${tile(c.bucket)}`}><Icon name={c.icon} /></span>{c.name}</span>
                  <span><b>{cedis(c.total)}</b> <span className="sk-cap">/ {cedis(c.plan)}</span></span>
                </div>
                <Bar value={c.total} max={c.plan} tone={c.bucket} thin />
              </div>
            ))
          ) : (
            <Empty title="No spending logged this year" />
          )}
        </div>
      </div>
      <div className="sk-card sk-card--pad">
        <div className="sk-between" style={{ marginBottom: 12 }}>
          <b className="sk-h">Transactions</b>
          <Link className="sk-link" href="/transactions">All transactions</Link>
        </div>
        <div className="sk-tablewrap">
          <table className="sk-table">
            <thead><tr><th>Date</th><th>Name</th><th className="hide-mobile">Category</th><th className="hide-mobile">Paid with</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id}>
                  <td>{t.occurredOn.slice(8)} {new Date(`${t.occurredOn}T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}</td>
                  <td>{t.name}</td>
                  <td className="hide-mobile">{t.catName ?? "—"}</td>
                  <td className="hide-mobile">{METHOD_LABEL[t.method] ?? t.method}</td>
                  <td className={`r ${t.kind === "income" ? "t-income" : ""}`}>{t.kind === "income" ? "+" : "−"}{cedis(t.amountMinor, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
