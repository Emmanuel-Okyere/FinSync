import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { incomes, savingsAccounts } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { cutSuggestions, monthView, paceOf } from "@/lib/budget";
import { fmtWeekday, monthEnd, monthStart, todayISO } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { dailySpend, listTransactions } from "@/lib/queries";
import { schemeLabel } from "@/lib/schemes";
import { ActionButton } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { Donut, WeekBars } from "@/components/app/charts";
import { Amount, Bar, DiffTag, Empty, Tx } from "@/components/app/ui";
import { moveBetweenLines } from "../_actions/budget";

export const metadata = { title: "Overview · FinSync" };

export default async function Home() {
  const user = await requireOnboardedUser();
  const today = todayISO();
  const month = monthStart(today);
  const v = await monthView(user, month);
  const [recent, accounts, incomeRows, daily] = await Promise.all([
    listTransactions(user.id, { limit: 6 }),
    db.select().from(savingsAccounts).where(eq(savingsAccounts.userId, user.id)).orderBy(savingsAccounts.createdAt),
    db.select().from(incomes).where(eq(incomes.userId, user.id)),
    dailySpend(user.id, month, monthEnd(month)),
  ]);
  const cuts = cutSuggestions(v);
  const savedTotal = accounts.reduce((s, a) => s + a.balanceMinor, 0);
  const weeks = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, v.days],
  ].map(([a, b]) => ({
    label: `${a}–${b}`,
    actual: daily.slice(a - 1, b).reduce((s, x) => s + x, 0),
    plan: Math.round((v.spendTarget * (b - a + 1)) / v.days),
    future: a > v.day,
  }));
  const spendBuckets = v.buckets.filter((b) => b.key !== "savings");

  return (
    <>
      <div className="sk-between hide-desktop">
        <div>
          <div className="sk-cap">{fmtWeekday(today)}</div>
          <div className="sk-h" style={{ fontSize: 22 }}>Hi, {user.firstName}</div>
        </div>
        <Link className="sk-iconbtn" href="/settings" aria-label="Settings">
          <Icon name="settings" />
        </Link>
      </div>
      <div className="hide-mobile">
        <PageHead title="Overview" sub={`${fmtWeekday(today)} · payday in ${v.daysLeft} day${v.daysLeft === 1 ? "" : "s"}`} />
      </div>

      <div className="sk-grid g-kpi">
        <div className="sk-hero sk-stack" style={{ gap: 6 }}>
          <div className="sk-hero__deco" />
          <div className="sk-hero__deco2" />
          <div className="sk-over">Safe to spend today</div>
          <div>
            <Amount minor={v.safeToday} decimals={2} style={{ fontSize: 40, lineHeight: "44px" }} />
          </div>
          <div className="sk-cap">
            {v.left >= 0 ? `GH₵ ${cedis(v.left)} left for ${v.daysLeft} day${v.daysLeft === 1 ? "" : "s"}` : `GH₵ ${cedis(-v.left)} over plan`} · {schemeLabel(v.scheme)}
          </div>
          <div style={{ marginTop: 6 }}>
            <Bar hero value={v.spent} max={v.spendTarget} marker={v.day / v.days} thin />
          </div>
          <div className="sk-between sk-cap">
            <span>Day {v.day} of {v.days}</span>
            <span>Payday in {v.daysLeft} day{v.daysLeft === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="sk-kpi hide-mobile">
          <div className="sk-over">Income</div>
          <Amount minor={v.income} className="t-income" />
          <div className="sk-cap t-income">{incomeRows.map((i) => `${i.name} ${cedis(i.amountMinor)}`).join(" · ")}</div>
        </div>
        <div className="sk-kpi hide-mobile">
          <div className="sk-over">Spent</div>
          <Amount minor={v.spent} />
          <div className="sk-cap">{spendBuckets.map((b) => `${b.name} ${cedis(b.actual)}`).join(" · ")}</div>
        </div>
        <div className="sk-kpi hide-mobile">
          <div className="sk-over">Saved</div>
          <Amount minor={v.saved} className="t-sav" />
          <div className="sk-cap">{v.savingsTarget ? `${Math.round((v.saved / v.savingsTarget) * 100)}% of the ${cedis(v.savingsTarget)} target` : "No savings bucket"}</div>
        </div>
      </div>

      <div className="hide-desktop" style={{ display: "grid", gridTemplateColumns: `repeat(${v.buckets.length}, minmax(0,1fr))`, gap: 10 }}>
        {v.buckets.map((b) => {
          const pace = paceOf(b.actual, b.target, v.day, v.days);
          return (
            <Link key={b.key} href="/budget" className="sk-card" style={{ padding: 12, textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="sk-row sk-cap"><i className={`sk-dot b-${b.key === "savings" ? "savings" : b.key === "wants" ? "wants" : b.key === "needs" ? "needs" : "over"}`} />{b.key === "savings" ? "Saved" : b.name}</div>
              <div className="sk-num" style={{ fontSize: 20 }}>{cedis(b.actual)}</div>
              <Bar value={b.actual} max={b.target} tone={b.key} marker={b.key === "savings" ? undefined : v.day / v.days} thin />
              <div className={`sk-cap ${pace === "ahead" ? "t-warn" : pace === "over" && b.key !== "savings" ? "t-expense" : ""}`}>
                {b.key !== "savings" && pace === "ahead" ? "ahead of pace" : b.key !== "savings" && pace === "over" ? "over plan" : `of ${cedis(b.target)}`}
              </div>
            </Link>
          );
        })}
      </div>

      {cuts[0] && cuts[0].kind === "move" ? (
        <div className="sk-cut hide-desktop">
          <div className="sk-tile sk-tile--over"><Icon name="scissors" /></div>
          <div className="sk-cut__body">
            <b>{cuts[0].title}</b>
            <span className="sk-cap">{cuts[0].detail}</span>
            <div className="sk-row">
              <ActionButton action={moveBetweenLines} fields={{ from: cuts[0].fromLineId!, to: cuts[0].toLineId!, amount: (cuts[0].saves / 100).toFixed(2) }}>
                Move it
              </ActionButton>
              <Link className="sk-btn sk-btn--sm sk-btn--quiet" href="/insights">More ideas</Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="sk-grid g-wide hide-mobile">
        <div className="sk-card sk-card--pad">
          <div className="sk-between">
            <b className="sk-h">Your split</b>
            <Link className="sk-link" style={{ fontSize: 14 }} href="/budget#scheme">Change</Link>
          </div>
          <div className="sk-cap">{schemeLabel(v.scheme)} on GH₵ {cedis(v.income)}</div>
          <div className="sk-row" style={{ gap: 20, marginTop: 16 }}>
            <Donut parts={v.buckets.map((b) => ({ key: b.key, value: b.actual }))} total={v.income} label="Spending by bucket" />
            <div className="sk-stack grow" style={{ gap: 12, fontSize: 14 }}>
              {v.buckets.map((b) => (
                <div key={b.key}>
                  <div className="sk-row"><i className={`sk-dot b-${b.key === "needs" ? "needs" : b.key === "wants" ? "wants" : b.key === "savings" ? "savings" : "over"}`} />{b.name}</div>
                  <b>{cedis(b.actual)}</b> <span className="sk-cap">/ {cedis(b.target)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="sk-card sk-card--pad">
          <div className="sk-between">
            <b className="sk-h">By week</b>
            <span className="sk-row sk-cap" style={{ gap: 12 }}>
              <span className="sk-row"><i className="sk-dot b-needs" />On plan</span>
              <span className="sk-row"><i className="sk-dot b-wants" />Over 10%</span>
            </span>
          </div>
          <div className="sk-cap" style={{ marginBottom: 14 }}>Spending each week against an even share of the plan</div>
          <WeekBars weeks={weeks} />
        </div>
        <div className="sk-card sk-card--pad sk-stack">
          <div className="sk-between">
            <b className="sk-h">Cuts</b>
            {cuts.length ? <span className="sk-tag sk-tag--under">GH₵ {cedis(cuts.reduce((s, c) => s + c.saves, 0))} back</span> : null}
          </div>
          {cuts.length ? (
            cuts.slice(0, 3).map((c, i) => (
              <div key={i} className="sk-row" style={{ alignItems: "flex-start", gap: 10 }}>
                <span className={`sk-tile sk-tile--sm ${c.kind === "move" ? "sk-tile--over" : "sk-tile--wants"}`}><Icon name={c.icon} /></span>
                <div className="grow">
                  <b style={{ fontSize: 14 }}>{c.title}</b>
                  <div className="sk-cap">{c.detail}</div>
                </div>
                {c.kind === "move" ? (
                  <ActionButton action={moveBetweenLines} fields={{ from: c.fromLineId!, to: c.toLineId!, amount: (c.saves / 100).toFixed(2) }}>
                    Move
                  </ActionButton>
                ) : null}
              </div>
            ))
          ) : (
            <Empty title="You're on plan">No cuts needed right now.</Empty>
          )}
        </div>
      </div>

      <div className="sk-grid g-main">
        <div className="sk-card sk-card--pad hide-mobile">
          <div className="sk-between" style={{ marginBottom: 12 }}>
            <b className="sk-h">Budget lines</b>
            <Link className="sk-link" style={{ fontSize: 14 }} href="/budget">Open budget</Link>
          </div>
          <div className="sk-tablewrap">
            <table className="sk-table">
              <thead>
                <tr><th>Line</th><th>Bucket</th><th className="r">Planned</th><th className="r">Actual</th><th className="r">Difference</th></tr>
              </thead>
              <tbody>
                {v.lines.slice(0, 7).map((l) => (
                  <tr key={l.id} className={l.done ? "is-done" : ""}>
                    <td className="nm">
                      <span className="sk-row" style={{ gap: 10 }}>
                        <span className={`sk-tile sk-tile--sm sk-tile--${l.bucket === "wants" ? "wants" : l.bucket === "savings" ? "savings" : "needs"}`}><Icon name={l.icon} /></span>
                        <b style={{ fontWeight: 600 }}>{l.name}</b>
                      </span>
                    </td>
                    <td><span className={`sk-tag sk-tag--${l.bucket === "wants" ? "wants" : l.bucket === "savings" ? "savings" : "needs"}`}>{v.scheme.buckets.find((b) => b.key === l.bucket)?.name}</span></td>
                    <td className="r">{cedis(l.planned, 2)}</td>
                    <td className="r">{cedis(l.actual, 2)}</td>
                    <td className="r"><DiffTag planned={l.planned} actual={l.actual} done={l.done} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="sk-stack" style={{ gap: 24 }}>
          <div className="sk-card sk-card--pad hide-mobile">
            <div className="sk-between">
              <b className="sk-h">Savings</b>
              <span className="sk-num" style={{ fontSize: 20 }}>{cedis(savedTotal)}</span>
            </div>
            {accounts.length ? (
              accounts.slice(0, 3).map((a) => (
                <div key={a.id} className="sk-tx" style={{ display: "block", padding: "12px 0" }}>
                  <div className="sk-row" style={{ gap: 12 }}>
                    <div className="sk-tile sk-tile--savings"><Icon name="wallet" /></div>
                    <div className="sk-tx__main">
                      <div className="sk-tx__name">{a.name}</div>
                      <div className="sk-cap">{a.note ?? a.kind}</div>
                    </div>
                    <div className="right">
                      <div className="sk-tx__amt">{cedis(a.balanceMinor)}</div>
                      {a.goalMinor ? <div className="sk-cap" style={{ fontSize: 12 }}>goal {cedis(a.goalMinor)}</div> : null}
                    </div>
                  </div>
                  {a.goalMinor ? <div style={{ marginTop: 8 }}><Bar value={a.balanceMinor} max={a.goalMinor} tone="savings" thin /></div> : null}
                </div>
              ))
            ) : (
              <Empty title="No savings places yet"><Link className="sk-link" href="/savings">Add one</Link></Empty>
            )}
          </div>
          <div className="sk-card sk-card--pad">
            <div className="sk-between">
              <b className="sk-h">Recent</b>
              <Link className="sk-link" href="/transactions">See all</Link>
            </div>
            {recent.length ? recent.map((t) => <Tx key={t.id} t={t} />) : <Empty title="Nothing logged yet">Tap the gold + to add your first entry.</Empty>}
          </div>
        </div>
      </div>
    </>
  );
}
