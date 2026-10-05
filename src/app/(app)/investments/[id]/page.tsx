import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { investmentEntries, investments } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { fmtMonthYear, fmtShort, todayISO } from "@/lib/dates";
import { KIND_LABEL, summarise } from "@/lib/invest";
import { cedis } from "@/lib/money";
import { ActionButton, ActionForm, Dialog, Field, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { ValueLine } from "@/components/app/charts";
import { Amount, Empty } from "@/components/app/ui";
import { addContribution, deleteInvestment, saveInvestment, updateValue } from "../../_actions/wealth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function InvestmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireOnboardedUser();
  const [inv] = await db.select().from(investments).where(and(eq(investments.id, id), eq(investments.userId, user.id)));
  if (!inv) notFound();
  const entries = await db.select().from(investmentEntries).where(eq(investmentEntries.investmentId, inv.id));
  const s = summarise(entries);
  const today = todayISO();
  const contribs = entries.filter((e) => e.kind === "contribution").sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  const last = [...entries].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))[0];

  return (
    <>
      <PageHead title={inv.name} back="/investments" sub={last ? `Updated ${fmtShort(last.occurredOn)}` : KIND_LABEL[inv.kind]} add={false}>
        <Dialog label={<Icon name="more" />} ariaLabel="More" title={`Edit ${inv.name}`} triggerClassName="sk-iconbtn">
          <ActionForm action={saveInvestment} className="sk-stack">
            <input type="hidden" name="id" value={inv.id} />
            <Field name="name" label="Name" required defaultValue={inv.name} maxLength={60} />
            <input type="hidden" name="kind" value={inv.kind} />
            <Field name="detail" label="Detail" defaultValue={inv.detail ?? ""} maxLength={120} />
            <Submit>Save</Submit>
          </ActionForm>
          <ActionButton action={deleteInvestment} fields={{ id: inv.id }} className="sk-btn sk-btn--danger sk-btn--block" confirm={`Delete ${inv.name} and its history?`}>Delete investment</ActionButton>
        </Dialog>
      </PageHead>
      <div className="sk-grid g-main">
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack">
            <Amount minor={s.value} style={{ fontSize: 40, lineHeight: "44px" }} />
            {s.invested ? <div className={`sk-cap ${s.growth >= 0 ? "t-income" : "t-expense"}`}>{s.growth >= 0 ? "+" : ""}{s.pct.toFixed(1)}% on what you put in</div> : null}
            <ValueLine values={s.series.map((x) => x.value)} label={`${inv.name} value over time`} />
            {s.series.length > 1 ? (
              <div className="sk-between sk-cap"><span>{fmtMonthYear(s.series[0].date)}</span><span>{fmtMonthYear(s.series[s.series.length - 1].date)}</span></div>
            ) : null}
          </div>
          <div className="sk-grid g-2" style={{ gap: 10 }}>
            <div className="sk-mini sk-mini--2"><small>You put in</small><b>{cedis(s.invested)}</b></div>
            <div className="sk-mini sk-mini--2"><small>Growth</small><b className={s.growth >= 0 ? "t-income" : "t-expense"}>{s.growth >= 0 ? "+" : "−"}{cedis(Math.abs(s.growth))}</b></div>
            {s.units ? <div className="sk-mini sk-mini--2"><small>Units</small><b>{s.units.toLocaleString("en-GH")}</b></div> : null}
            {s.units ? <div className="sk-mini sk-mini--2"><small>Price per unit</small><b>{(s.value / 100 / s.units).toFixed(2)}</b></div> : null}
          </div>
          <div className="sk-grid g-2" style={{ gap: 10 }}>
            <Dialog label="Update value" title="Update value" triggerClassName="sk-btn sk-btn--ghost">
              <ActionForm action={updateValue} className="sk-stack" reset>
                <input type="hidden" name="id" value={inv.id} />
                <Field name="value" label="Worth today (GH₵)" inputMode="decimal" required />
                <div className="sk-grid g-2" style={{ gap: 10 }}>
                  <Field name="units" label="Units (optional)" inputMode="decimal" />
                  <Field name="occurredOn" label="As of" type="date" required defaultValue={today} />
                </div>
                <Submit>Save value</Submit>
              </ActionForm>
            </Dialog>
            <Dialog label={<><Icon name="plus" />Add contribution</>} title="Add contribution" triggerClassName="sk-btn sk-btn--gold">
              <ActionForm action={addContribution} className="sk-stack" reset>
                <input type="hidden" name="id" value={inv.id} />
                <Field name="amount" label="Amount (GH₵)" inputMode="decimal" required />
                <div className="sk-grid g-2" style={{ gap: 10 }}>
                  <Field name="units" label="Units bought (optional)" inputMode="decimal" />
                  <Field name="occurredOn" label="Date" type="date" required defaultValue={today} />
                </div>
                <label className="sk-between" style={{ cursor: "pointer" }}>
                  <span><b>From my Savings bucket</b><div className="sk-cap">Counts as saving, not spending</div></span>
                  <input type="checkbox" className="sk-toggle" name="log" defaultChecked />
                </label>
                <Submit>Add contribution</Submit>
              </ActionForm>
            </Dialog>
          </div>
        </div>
        <div className="sk-card sk-card--pad">
          <b className="sk-h">Contributions</b>
          {contribs.length ? (
            contribs.map((c) => (
              <div key={c.id} className="sk-tx">
                <div className="sk-tile sk-tile--income"><Icon name="plus" /></div>
                <div className="sk-tx__main">
                  <div className="sk-tx__name">Contribution</div>
                  <div className="sk-cap">{fmtShort(c.occurredOn)}{c.note ? ` · ${c.note}` : ""}</div>
                </div>
                <div className="sk-tx__amt t-income">+{cedis(c.amountMinor, 2)}</div>
              </div>
            ))
          ) : (
            <Empty title="No contributions yet" />
          )}
        </div>
      </div>
      <p className="sk-cap">Values are entered by you or read from a statement.</p>
    </>
  );
}
