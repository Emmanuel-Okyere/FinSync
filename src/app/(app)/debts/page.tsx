import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { debts } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { simulatePayoff } from "@/lib/debt";
import { addMonths, fmtMonthYear, fmtShort, monthStart, todayISO } from "@/lib/dates";
import { cedis, toInputValue } from "@/lib/money";
import { ActionButton, ActionForm, Dialog, Field, SelectField, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { MoneyTabs } from "@/components/app/MoneyTabs";
import { PageHead } from "@/components/app/PageHead";
import { Amount, Bar, Empty } from "@/components/app/ui";
import { deleteDebt, recordDebtPayment, saveDebt } from "../_actions/wealth";

export const metadata = { title: "Debts · FinSync" };

type Debt = typeof debts.$inferSelect;

function DebtForm({ d, direction = "owe" }: { d?: Debt; direction?: "owe" | "owed" }) {
  return (
    <ActionForm action={saveDebt} className="sk-stack" reset={!d}>
      {d ? <input type="hidden" name="id" value={d.id} /> : null}
      <input type="hidden" name="direction" value={d?.direction ?? direction} />
      <Field name="name" label={(d?.direction ?? direction) === "owe" ? "Who do you owe?" : "Who owes you?"} required defaultValue={d?.name} maxLength={60} placeholder="e.g. Personal loan" />
      <SelectField name="lenderKind" label="Type" defaultValue={d?.lenderKind ?? "bank"} options={[{ value: "bank", label: "Bank or lender" }, { value: "shop", label: "Shop credit" }, { value: "personal", label: "Personal" }, { value: "other", label: "Other" }]} />
      <div className="sk-grid g-2" style={{ gap: 10 }}>
        <Field name="principal" label="Original amount (GH₵)" inputMode="decimal" required defaultValue={d ? toInputValue(d.principalMinor) : ""} />
        <Field name="balance" label="Still owed (GH₵)" inputMode="decimal" required defaultValue={d ? toInputValue(d.balanceMinor) : ""} />
        <Field name="apr" label="Interest % a year" inputMode="decimal" defaultValue={d ? String(d.aprBp / 100) : ""} placeholder="0" />
        <Field name="monthly" label="Monthly payment (GH₵)" inputMode="decimal" defaultValue={toInputValue(d?.monthlyMinor)} />
      </div>
      <Field name="nextDueOn" label="Next payment due" type="date" defaultValue={d?.nextDueOn ?? ""} />
      <Field name="note" label="Note (optional)" defaultValue={d?.note ?? ""} maxLength={120} />
      <Submit>{d ? "Save changes" : "Add"}</Submit>
    </ActionForm>
  );
}

function PayForm({ d, today }: { d: Debt; today: string }) {
  return (
    <ActionForm action={recordDebtPayment} className="sk-stack" reset>
      <input type="hidden" name="id" value={d.id} />
      <div className="sk-grid g-2" style={{ gap: 10 }}>
        <Field name="amount" label="Amount (GH₵)" inputMode="decimal" required defaultValue={toInputValue(d.monthlyMinor && d.monthlyMinor <= d.balanceMinor ? d.monthlyMinor : d.balanceMinor)} />
        <Field name="occurredOn" label="Date" type="date" required defaultValue={today} />
      </div>
      <label className="sk-between" style={{ cursor: "pointer" }}>
        <span>
          <b>{d.direction === "owe" ? "Log as an expense" : "Log as income"}</b>
          <div className="sk-cap">{d.direction === "owe" ? "Counts in Needs as Debt repayment" : "Adds it to Other income"}</div>
        </span>
        <input type="checkbox" className="sk-toggle" name="log" defaultChecked />
      </label>
      <Submit>{d.direction === "owe" ? "Record payment" : "Record repayment"}</Submit>
    </ActionForm>
  );
}

export default async function Debts({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const order = (await searchParams).order === "snowball" ? "snowball" : "avalanche";
  const user = await requireOnboardedUser();
  const today = todayISO();
  const rows = await db.select().from(debts).where(eq(debts.userId, user.id)).orderBy(debts.createdAt);
  const owe = rows.filter((d) => d.direction === "owe");
  const owed = rows.filter((d) => d.direction === "owed" && d.balanceMinor > 0);
  const total = owe.reduce((s, d) => s + d.balanceMinor, 0);
  const sims = owe.map((d) => ({ id: d.id, balance: d.balanceMinor, aprBp: d.aprBp, monthly: d.monthlyMinor ?? 0 }));
  const plan = simulatePayoff(sims, order);
  const other = simulatePayoff(sims, order === "avalanche" ? "snowball" : "avalanche");
  const saving = other.interest - plan.interest;
  const sorted = [...owe].sort((a, b) => plan.order.indexOf(a.id) - plan.order.indexOf(b.id));

  return (
    <>
      <PageHead title="Debts">
        <Dialog label={<Icon name="plus" />} ariaLabel="Add a debt" title="Add a debt" triggerClassName="sk-iconbtn">
          <DebtForm />
        </Dialog>
      </PageHead>
      <MoneyTabs on="/debts" />
      <div className="sk-grid g-main">
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack">
            <div className="sk-between">
              <div><div className="sk-over">You owe</div><Amount minor={total} style={{ fontSize: 30 }} /></div>
              <div className="right">
                <div className="sk-over">Debt-free by</div>
                <div className="sk-num" style={{ fontSize: 22 }}>{total === 0 ? "Now" : plan.feasible ? fmtMonthYear(addMonths(monthStart(today), plan.months)) : "Add payments"}</div>
              </div>
            </div>
            {owe.length > 1 ? (
              <>
                <div className="sk-cap">Payoff order</div>
                <nav className="sk-seg" aria-label="Payoff order">
                  <Link href="/debts" className={order === "avalanche" ? "is-on" : ""}>Highest interest first</Link>
                  <Link href="/debts?order=snowball" className={order === "snowball" ? "is-on" : ""}>Smallest first</Link>
                </nav>
                <div className="sk-cap">
                  {saving > 0
                    ? `Saves GH₵ ${cedis(saving)} in interest compared with ${order === "avalanche" ? "smallest" : "highest interest"} first.`
                    : saving < 0
                      ? `Costs GH₵ ${cedis(-saving)} more interest, but clears small debts sooner.`
                      : "Both orders cost the same here."}
                </div>
              </>
            ) : null}
          </div>
          {sorted.length ? (
            sorted.map((d, i) => {
              const paid = d.principalMinor - d.balanceMinor;
              return (
                <div key={d.id} className="sk-acct">
                  <div className="sk-row" style={{ gap: 12 }}>
                    <div className="sk-tile sk-tile--over"><Icon name={d.lenderKind === "personal" ? "user" : d.lenderKind === "shop" ? "cart" : "bank"} /></div>
                    <div className="grow">
                      <div className="sk-row"><b>{d.name}</b>{i === 0 && owe.length > 1 && d.balanceMinor > 0 ? <span className="sk-tag sk-tag--needs">Pay first</span> : null}</div>
                      <div className="sk-cap">{d.monthlyMinor ? `GH₵ ${cedis(d.monthlyMinor)} a month` : (d.note ?? "No set payment")}</div>
                    </div>
                    <div className="right">
                      <div className="sk-tx__amt">{cedis(d.balanceMinor)}</div>
                      <div className="sk-cap">{d.aprBp ? `${d.aprBp / 100}% a year` : d.lenderKind === "personal" ? "Personal" : "No interest"}</div>
                    </div>
                  </div>
                  <Bar value={paid} max={d.principalMinor} thin />
                  <div className="sk-between sk-cap">
                    <span>{Math.round((paid / Math.max(1, d.principalMinor)) * 100)}% paid of {cedis(d.principalMinor)}</span>
                    <span>{d.nextDueOn ? `Next: ${fmtShort(d.nextDueOn)}` : ""}</span>
                  </div>
                  <div className="sk-row">
                    {d.balanceMinor > 0 ? (
                      <Dialog label="Record payment" title={`Pay ${d.name}`} triggerClassName="sk-btn sk-btn--sm">
                        <PayForm d={d} today={today} />
                      </Dialog>
                    ) : <span className="sk-tag sk-tag--under"><Icon name="check" />Paid off</span>}
                    <Dialog label="Edit" title={`Edit ${d.name}`} triggerClassName="sk-btn sk-btn--sm sk-btn--quiet">
                      <DebtForm d={d} />
                      <ActionButton action={deleteDebt} fields={{ id: d.id }} className="sk-btn sk-btn--danger sk-btn--block" confirm={{ title: `Remove ${d.name}?`, body: "Past entries you logged for it stay in your transactions.", confirmLabel: "Remove", danger: true }}>Remove</ActionButton>
                    </Dialog>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="sk-card"><Empty icon={<Icon name="card" />} title="No debts. Nice.">Add loans, shop credit or money you borrowed to plan a payoff.</Empty></div>
          )}
        </div>
        <div className="sk-card sk-card--flat sk-card--pad sk-stack" style={{ alignSelf: "start" }}>
          <div className="sk-between">
            <span className="sk-row"><Icon name="arrowDownLeft" /><b>Owed to you</b></span>
            <span className="sk-num t-income">GH₵ {cedis(owed.reduce((s, d) => s + d.balanceMinor, 0))}</span>
          </div>
          {owed.map((d) => (
            <div key={d.id} className="sk-between">
              <span className="sk-cap">{d.name}{d.note ? ` · ${d.note}` : ""}</span>
              <Dialog label="Paid back" title={`${d.name} paid back`} triggerClassName="sk-btn sk-btn--sm sk-btn--quiet">
                <PayForm d={d} today={today} />
                <DebtForm d={d} />
              </Dialog>
            </div>
          ))}
          <Dialog label={<><Icon name="plus" />Someone owes me</>} title="Money owed to you" triggerClassName="sk-btn sk-btn--sm sk-btn--ghost">
            <DebtForm direction="owed" />
          </Dialog>
        </div>
      </div>
    </>
  );
}
