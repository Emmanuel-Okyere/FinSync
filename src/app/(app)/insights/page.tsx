import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/session";
import { cutSuggestions, periodView } from "@/lib/budget";
import { fmtShort, parseDateParam } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { dailySpend } from "@/lib/queries";
import { ActionButton } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PeriodSwitch, PageHead } from "@/components/app/PageHead";
import { PaceChart } from "@/components/app/charts";
import { Empty } from "@/components/app/ui";
import { moveBetweenLines } from "../_actions/budget";

export const metadata = { title: "Insights · FinSync" };

export default async function Insights({ searchParams }: { searchParams: Promise<{ p?: string; m?: string }> }) {
  const user = await requireOnboardedUser();
  const sp = await searchParams;
  const v = await periodView(user, parseDateParam(sp.p, sp.m));
  const { start, end, label } = v.period;
  const daily = await dailySpend(user.id, start, end);
  const day = v.isCurrent ? v.day : v.days;
  const spentSoFar = daily.slice(0, day).reduce((s, x) => s + x, 0);
  const planSoFar = Math.round((v.spendTarget * day) / v.days);
  const ahead = spentSoFar - planSoFar;
  const cuts = cutSuggestions(v);
  const back = cuts.reduce((s, c) => s + c.saves, 0);

  return (
    <>
      <PageHead title="Insights" sub={<Link className="sk-link" href="/reports">Reports →</Link>}>
        <PeriodSwitch start={start} end={end} label={label} base="/insights" />
      </PageHead>
      <div className="sk-grid g-2">
        <div className="sk-card sk-card--pad sk-stack">
          <div className="sk-between">
            <b>Spending pace</b>
            {ahead > 0 ? <span className="sk-tag sk-tag--pace">GH₵ {cedis(ahead)} ahead</span> : <span className="sk-tag sk-tag--under">GH₵ {cedis(-ahead)} behind plan</span>}
          </div>
          <div className="sk-cap">Solid line is what you spent. Dashed line is the plan.</div>
          <PaceChart daily={daily} plan={v.spendTarget} days={v.days} today={day} />
          <div className="sk-between sk-cap">
            <span>{fmtShort(start)}</span>
            {v.isCurrent ? <span>Today</span> : null}
            <span>{fmtShort(end)}</span>
          </div>
        </div>
        <div className="sk-stack">
          <div>
            <h2 className="sk-h">{cuts.length ? `${cuts.length} way${cuts.length === 1 ? "" : "s"} to finish $this cycle on plan` : `$this cycle is on plan`}</h2>
            {cuts.length ? <div className="sk-cap">Do all of them and you get about GH₵ {cedis(back)} back.</div> : null}
          </div>
          {cuts.length ? (
            cuts.map((c, i) => (
              <div key={i} className="sk-cut">
                <div className={`sk-tile ${c.kind === "move" ? "sk-tile--over" : "sk-tile--wants"}`}><Icon name={c.icon} /></div>
                <div className="sk-cut__body">
                  <div className="sk-between">
                    <b>{c.title}</b>
                    <span className="sk-cut__save">{c.kind === "move" ? cedis(c.saves) : `+${cedis(c.saves)}`}</span>
                  </div>
                  <span className="sk-cap">{c.detail}</span>
                  {c.kind === "move" ? (
                    <div>
                      <ActionButton action={moveBetweenLines} fields={{ from: c.fromLineId!, to: c.toLineId!, amount: (c.saves / 100).toFixed(2) }}>
                        Move GH₵ {cedis(c.saves)}
                      </ActionButton>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <div className="sk-card"><Empty title="Nothing to cut">Every line is within plan at the current pace.</Empty></div>
          )}
        </div>
      </div>
    </>
  );
}
