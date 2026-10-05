import Link from "next/link";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, insurancePolicies, transactions } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { monthEnd, monthStart, todayISO } from "@/lib/dates";
import { KIND_LABEL, portfolio } from "@/lib/invest";
import { cedis } from "@/lib/money";
import { ActionForm, Dialog, Field, SelectField, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { MoneyTabs } from "@/components/app/MoneyTabs";
import { PageHead } from "@/components/app/PageHead";
import { ValueLine } from "@/components/app/charts";
import { Amount, Empty } from "@/components/app/ui";
import { saveInvestment } from "../_actions/wealth";

export const metadata = { title: "Investments · FinSync" };

const KIND_ICON: Record<string, string> = { pension: "umbrella", fund: "reports", deposit: "bank", stocks: "trendUp", other: "briefcase" };
const KIND_TONE: Record<string, string> = { pension: "var(--brand)", fund: "var(--savings)", deposit: "var(--ink-muted)", stocks: "var(--accent)", other: "var(--expense)" };

export default async function Investments() {
  const user = await requireOnboardedUser();
  const month = monthStart(todayISO());
  const [p, investedThisMonth, premiums] = await Promise.all([
    portfolio(user.id),
    db
      .select({ total: sql<string>`coalesce(sum(${transactions.amountMinor}),0)` })
      .from(transactions)
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(eq(transactions.userId, user.id), eq(categories.name, "Investments"), gte(transactions.occurredOn, month), lte(transactions.occurredOn, monthEnd(month)))),
    db.select().from(insurancePolicies).where(eq(insurancePolicies.userId, user.id)),
  ]);
  const byKind = Object.entries(
    p.rows.reduce<Record<string, number>>((acc, r) => ((acc[r.inv.kind] = (acc[r.inv.kind] ?? 0) + r.value), acc), {}),
  ).sort((a, b) => b[1] - a[1]);
  const monthlyPremium = premiums.reduce((s, x) => s + (x.frequency === "monthly" ? x.premiumMinor : Math.round(x.premiumMinor / 12)), 0);

  return (
    <>
      <PageHead title="Investments" sub="What you own and how it's growing">
        <Dialog label={<Icon name="plus" />} ariaLabel="Add investment" title="Add an investment" triggerClassName="sk-iconbtn">
          <ActionForm action={saveInvestment} className="sk-stack" reset>
            <Field name="name" label="Name" required placeholder="e.g. Balanced mutual fund" maxLength={60} />
            <SelectField name="kind" label="Type" options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} defaultValue="fund" />
            <Field name="detail" label="Detail (optional)" placeholder="e.g. You 150 + employer 150 a month" maxLength={120} />
            <div className="sk-grid g-2" style={{ gap: 10 }}>
              <Field name="invested" label="Put in so far (GH₵)" inputMode="decimal" />
              <Field name="value" label="Worth today (GH₵)" inputMode="decimal" />
            </div>
            <Submit>Add investment</Submit>
          </ActionForm>
        </Dialog>
      </PageHead>
      <MoneyTabs on="/investments" />
      <div className="sk-grid g-4 hide-mobile">
        <div className="sk-kpi"><div className="sk-over">Investments</div><Amount minor={p.total} /><div className={`sk-cap ${p.growth >= 0 ? "t-income" : "t-expense"}`}>{p.growth >= 0 ? "+" : "−"}GH₵ {cedis(Math.abs(p.growth))} growth</div></div>
        <div className="sk-kpi"><div className="sk-over">Put in</div><Amount minor={p.invested} /><div className="sk-cap">Across {p.rows.length} holding{p.rows.length === 1 ? "" : "s"}</div></div>
        <div className="sk-kpi"><div className="sk-over">Invested this month</div><Amount minor={Number(investedThisMonth[0]?.total ?? 0)} /><div className="sk-cap">From the Savings bucket · not spending</div></div>
        <div className="sk-kpi"><div className="sk-over">Insurance premiums</div><Amount minor={monthlyPremium} /><div className="sk-cap"><Link className="sk-link" href="/insurance">A month on average · {premiums.length} policies</Link></div></div>
      </div>
      <div className="sk-grid g-main">
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack">
            <div className="sk-over">Portfolio value</div>
            <Amount minor={p.total} style={{ fontSize: 34, lineHeight: "40px" }} />
            {p.invested ? <div className={`sk-cap ${p.growth >= 0 ? "t-income" : "t-expense"}`}>{p.growth >= 0 ? "+" : "−"}GH₵ {cedis(Math.abs(p.growth))} · {((p.growth / p.invested) * 100).toFixed(1)}% on what you put in</div> : null}
            <ValueLine values={p.series} label="Portfolio value over time" />
            {byKind.length ? (
              <>
                <div className="sk-stackbar">{byKind.map(([k, v]) => <i key={k} style={{ flex: v || 0.0001, background: KIND_TONE[k] }} />)}</div>
                <div className="sk-row sk-wrap sk-cap" style={{ gap: 14 }}>
                  {byKind.map(([k, v]) => (
                    <span key={k} className="sk-row"><i className="sk-dot" style={{ background: KIND_TONE[k] }} />{KIND_LABEL[k]} {p.total ? Math.round((v / p.total) * 100) : 0}%</span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className="sk-card sk-card--pad">
          <b className="sk-h">Holdings</b>
          {p.rows.length ? (
            p.rows.map((r) => (
              <Link key={r.inv.id} href={`/investments/${r.inv.id}`} className="sk-tx">
                <div className="sk-tile sk-tile--savings"><Icon name={KIND_ICON[r.inv.kind] ?? "trendUp"} /></div>
                <div className="sk-tx__main">
                  <div className="sk-tx__name">{r.inv.name}</div>
                  <div className="sk-cap">{r.inv.detail ?? KIND_LABEL[r.inv.kind]}</div>
                </div>
                <div className="right">
                  <div className="sk-tx__amt">{cedis(r.value)}</div>
                  {r.invested ? <div className={`sk-cap ${r.growth >= 0 ? "t-income" : "t-expense"}`}>{r.growth >= 0 ? "+" : ""}{r.pct.toFixed(1)}%</div> : null}
                </div>
              </Link>
            ))
          ) : (
            <Empty icon={<Icon name="trendUp" />} title="No investments yet">Add a pension, fund, fixed deposit or shares.</Empty>
          )}
        </div>
      </div>
      <p className="sk-cap">Values are entered by you or read from a statement.</p>
    </>
  );
}
