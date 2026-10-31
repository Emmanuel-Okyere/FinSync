import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, setAsidePayouts, setAsides } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { periodView } from "@/lib/budget";
import { addDays, addYears, diffDays, fmtDue, fmtShort, todayISO } from "@/lib/dates";
import { cedis, toInputValue } from "@/lib/money";
import { setAsideBalances } from "@/lib/plans";
import { ActionButton, ActionForm, Dialog, Field, SelectField, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { AddToLineButton } from "@/components/app/AddEntry";
import { Amount, Bar, Empty } from "@/components/app/ui";
import { deleteSetAside, paySetAside, saveSetAside } from "../../_actions/plans";

export const metadata = { title: "Set-asides · FinSync" };

const BUCKETS = [
  { value: "needs", label: "Needs" },
  { value: "wants", label: "Wants" },
  { value: "savings", label: "Savings" },
];

function months(from: string, to: string) {
  const d = Math.max(0, diffDays(from, to));
  if (d < 45) return `${d} day${d === 1 ? "" : "s"}`;
  const m = Math.round(d / 30.4);
  return `${m} month${m === 1 ? "" : "s"}`;
}

export default async function SetAsides() {
  const user = await requireOnboardedUser();
  const today = todayISO();
  const v = await periodView(user, today);
  const [rows, payouts] = await Promise.all([
    db
      .select({ s: setAsides, bucket: categories.bucket })
      .from(setAsides)
      .innerJoin(categories, eq(categories.id, setAsides.categoryId))
      .where(eq(setAsides.userId, user.id))
      .orderBy(desc(setAsides.active), setAsides.dueOn),
    db.select().from(setAsidePayouts).where(eq(setAsidePayouts.userId, user.id)).orderBy(desc(setAsidePayouts.paidOn)).limit(50),
  ]);
  const balances = await setAsideBalances(
    user.id,
    rows.map((r) => r.s),
  );
  const lineByCat = new Map(v.lines.map((l) => [l.categoryId, l]));
  const thisCycle = rows.reduce((s, r) => s + (lineByCat.get(r.s.categoryId)?.planned ?? 0), 0);
  const inPots = rows.reduce((s, r) => s + Math.max(0, balances.get(r.s.id) ?? 0), 0);

  const form = (r?: (typeof rows)[number]) => (
    <ActionForm action={saveSetAside} className="sk-stack" reset={!r}>
      {r ? <input type="hidden" name="id" value={r.s.id} /> : null}
      <Field name="name" label="What it's for" required defaultValue={r?.s.name} maxLength={40} placeholder="e.g. Rent (yearly), School fees" />
      <div className="sk-grid g-2" style={{ gap: 10 }}>
        <Field name="target" label="Amount needed (GH₵)" inputMode="decimal" required defaultValue={r ? toInputValue(r.s.targetMinor) : ""} />
        <Field name="dueOn" label="Due on" type="date" required defaultValue={r?.s.dueOn ?? addDays(today, 365)} />
      </div>
      <div className="sk-grid g-2" style={{ gap: 10 }}>
        <SelectField name="repeat" label="Comes" options={[{ value: "yearly", label: "Every year" }, { value: "once", label: "Just once" }]} defaultValue={r?.s.repeat ?? "yearly"} />
        <SelectField name="bucket" label="Counts toward" options={BUCKETS} defaultValue={r?.bucket ?? "needs"} />
      </div>
      <Field name="opening" label="Already put aside (GH₵, optional)" inputMode="decimal" defaultValue={r?.s.openingMinor ? toInputValue(r.s.openingMinor) : ""} hint="Money you'd saved for it before using FinSync" />
      <Submit>{r ? "Save changes" : "Start setting aside"}</Submit>
    </ActionForm>
  );

  return (
    <>
      <PageHead title="Set-asides" back="/budget" sub="Big bills that come once a year, paid a little each cycle">
        <Dialog label={<><Icon name="plus" />New</>} title="New set-aside" triggerClassName="sk-btn sk-btn--sm sk-btn--quiet">
          {form()}
        </Dialog>
      </PageHead>
      <div className="sk-grid g-main">
        <div className="sk-stack" style={{ gap: 12 }}>
          {rows.length ? (
            rows.map((r) => {
              const { s } = r;
              const bal = balances.get(s.id) ?? 0;
              const line = lineByCat.get(s.categoryId);
              const per = line?.planned ?? 0;
              const putThisCycle = line?.actual ?? 0;
              const ready = bal >= s.targetMinor;
              const history = payouts.filter((p) => p.setAsideId === s.id).slice(0, 3);
              return (
                <div key={s.id} className="sk-card sk-card--pad sk-stack" style={{ gap: 10, opacity: s.active ? 1 : 0.6 }}>
                  <div className="sk-between" style={{ alignItems: "flex-start" }}>
                    <div className="sk-row" style={{ gap: 12 }}>
                      <span className="sk-tile sk-tile--needs"><Icon name="calendar" /></span>
                      <div>
                        <b>{s.name}</b>
                        <div className="sk-cap">
                          {s.active ? `Due ${fmtDue(s.dueOn)} · in ${months(today, s.dueOn)}${s.repeat === "yearly" ? " · every year" : ""}` : "Paid · finished"}
                        </div>
                      </div>
                    </div>
                    <Dialog label={<Icon name="edit" />} ariaLabel={`Edit ${s.name}`} title={`Edit ${s.name}`} triggerClassName="sk-iconbtn">
                      {form(r)}
                      <ActionButton action={deleteSetAside} fields={{ id: s.id }} className="sk-btn sk-btn--danger sk-btn--block" confirm={{ title: `Remove ${s.name}?`, body: "It stops being planned. What you've already put aside stays in your history.", confirmLabel: "Remove", danger: true }}>
                        Remove set-aside
                      </ActionButton>
                    </Dialog>
                  </div>
                  <div className="sk-between">
                    <span><Amount minor={Math.max(0, bal)} style={{ fontSize: 22 }} /> <span className="sk-cap">of GH₵ {cedis(s.targetMinor)}</span></span>
                    {ready ? <span className="sk-tag sk-tag--under"><Icon name="check" />Ready</span> : null}
                  </div>
                  <Bar value={Math.max(0, bal)} max={s.targetMinor} tone="savings" thin />
                  {s.active ? (
                    <div className="sk-cap">
                      {per > 0
                        ? <>This cycle: put aside <b style={{ color: "var(--ink)" }}>GH₵ {cedis(per)}</b>{putThisCycle ? ` · GH₵ ${cedis(putThisCycle)} done` : ""}. It&apos;s a line in your budget.</>
                        : ready ? "Nothing more needed. Pay it from here when it's due." : "Nothing planned this cycle."}
                    </div>
                  ) : null}
                  {s.active ? (
                    <div className="sk-row sk-wrap" style={{ gap: 8 }}>
                      <span className="sk-row" style={{ gap: 6 }}>
                        <AddToLineButton categoryId={s.categoryId} name={s.name} defaultDate={today} />
                        <span className="sk-cap">Put money aside</span>
                      </span>
                      <span style={{ flex: 1 }} />
                      {bal > 0 ? (
                        <Dialog label={<>Pay the bill</>} title={`Pay ${s.name}`} triggerClassName="sk-btn sk-btn--sm sk-btn--ghost">
                          <ActionForm action={paySetAside} className="sk-stack">
                            <input type="hidden" name="id" value={s.id} />
                            <p className="sk-muted">
                              GH₵ {cedis(bal, 2)} is set aside. Paying from it doesn&apos;t count against this cycle&apos;s budget: you already budgeted it as you put it aside.
                              {s.repeat === "yearly" ? ` The next one will be due ${fmtDue(addYears(s.dueOn, 1))}.` : ""}
                            </p>
                            <div className="sk-grid g-2" style={{ gap: 10 }}>
                              <Field name="amount" label="Paid (GH₵)" inputMode="decimal" required defaultValue={toInputValue(Math.min(bal, s.targetMinor))} />
                              <Field name="date" label="Date" type="date" required defaultValue={today} />
                            </div>
                            <Submit>Record payment</Submit>
                          </ActionForm>
                        </Dialog>
                      ) : null}
                    </div>
                  ) : null}
                  {history.length ? (
                    <div className="sk-cap">Paid {history.map((p) => `GH₵ ${cedis(p.amountMinor)} on ${fmtShort(p.paidOn)}`).join(" · ")}</div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="sk-card sk-card--pad">
              <Empty title="Nothing set aside yet">
                Yearly rent, insurance, school fees, car papers: say how much and when, and each cycle&apos;s budget gets a line for its share.
              </Empty>
            </div>
          )}
        </div>
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack" style={{ gap: 8 }}>
            <div className="sk-over">Put aside so far</div>
            <Amount minor={inPots} style={{ fontSize: 34, lineHeight: "40px" }} />
            <div className="sk-cap">GH₵ {cedis(thisCycle)} planned this cycle across {rows.filter((r) => r.s.active).length} set-aside{rows.filter((r) => r.s.active).length === 1 ? "" : "s"}.</div>
          </div>
          <div className="sk-card sk-card--pad sk-cap sk-stack" style={{ gap: 6 }}>
            <b style={{ color: "var(--ink)" }}>How it works</b>
            <span>Each cycle plans what&apos;s still missing, spread over the cycles left before it&apos;s due.</span>
            <span>Putting money aside is logged like spending, so it comes out of that cycle&apos;s budget. Keep the cash somewhere separate (a savings wallet or account).</span>
            <span>When the bill arrives, pay it from here. Payday leftovers can top it up too.</span>
          </div>
        </div>
      </div>
    </>
  );
}
