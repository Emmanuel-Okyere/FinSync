import { eq } from "drizzle-orm";
import { db } from "@/db";
import { savingsAccounts } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { monthView } from "@/lib/budget";
import { fmtShort, monthStart, todayISO, relDay } from "@/lib/dates";
import { cedis, toInputValue } from "@/lib/money";
import { ActionButton, ActionForm, Dialog, Field, SelectField, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { MoneyTabs } from "@/components/app/MoneyTabs";
import { PageHead } from "@/components/app/PageHead";
import { Amount, Bar, Empty } from "@/components/app/ui";
import { deleteAccount, moveSavings, saveAccount } from "../_actions/wealth";

export const metadata = { title: "Savings · FinSync" };

const KINDS = [
  { value: "account", label: "Savings account" },
  { value: "tbill", label: "Treasury bill" },
  { value: "susu", label: "Susu" },
  { value: "wallet", label: "Mobile money wallet" },
  { value: "other", label: "Other" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;

function AccountForm({ a }: { a?: typeof savingsAccounts.$inferSelect }) {
  return (
    <ActionForm action={saveAccount} className="sk-stack" reset={!a}>
      {a ? <input type="hidden" name="id" value={a.id} /> : null}
      <Field name="name" label="Name" required defaultValue={a?.name} placeholder="e.g. Emergency fund" maxLength={60} />
      <SelectField name="kind" label="Type" options={KINDS} defaultValue={a?.kind ?? "account"} />
      <div className="sk-grid g-2" style={{ gap: 10 }}>
        <Field name="balance" label="Balance (GH₵)" inputMode="decimal" required defaultValue={a ? toInputValue(a.balanceMinor) : ""} />
        <Field name="goal" label="Goal (optional)" inputMode="decimal" defaultValue={toInputValue(a?.goalMinor)} />
        <Field name="maturesOn" label="Matures on (optional)" type="date" defaultValue={a?.maturesOn ?? ""} />
        <Field name="expectedReturn" label="Interest due (optional)" inputMode="decimal" defaultValue={toInputValue(a?.expectedReturnMinor)} />
      </div>
      <Field name="note" label="Note (optional)" defaultValue={a?.note ?? ""} placeholder="e.g. GH₵ 125 weekly · payout Dec" maxLength={120} />
      <Submit>{a ? "Save changes" : "Add"}</Submit>
    </ActionForm>
  );
}

export default async function Savings() {
  const user = await requireOnboardedUser();
  const today = todayISO();
  const [accounts, v] = await Promise.all([
    db.select().from(savingsAccounts).where(eq(savingsAccounts.userId, user.id)).orderBy(savingsAccounts.createdAt),
    monthView(user, monthStart(today)),
  ]);
  const total = accounts.reduce((s, a) => s + a.balanceMinor, 0);

  return (
    <>
      <PageHead title="Savings">
        <Dialog label={<Icon name="plus" />} ariaLabel="Add a savings place" title="Add a savings place" triggerClassName="sk-iconbtn">
          <AccountForm />
        </Dialog>
      </PageHead>
      <MoneyTabs on="/savings" />
      <div className="sk-grid g-main">
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack" style={{ gap: 6 }}>
            <div className="sk-over">Saved across {accounts.length} place{accounts.length === 1 ? "" : "s"}</div>
            <Amount minor={total} style={{ fontSize: 40, lineHeight: "44px" }} />
            <div className="sk-cap">This month: GH₵ {cedis(v.saved)} of {cedis(v.savingsTarget)} set aside</div>
            <Bar value={v.saved} max={v.savingsTarget} tone="savings" />
          </div>
          <div className="sk-card sk-card--pad">
            {accounts.length ? (
              accounts.map((a) => (
                <div key={a.id} className="sk-tx" style={{ display: "block" }}>
                  <div className="sk-row" style={{ gap: 12 }}>
                    <div className="sk-tile sk-tile--savings"><Icon name={a.kind === "wallet" ? "phone" : a.kind === "tbill" ? "bank" : a.kind === "susu" ? "users" : "wallet"} /></div>
                    <div className="sk-tx__main">
                      <div className="sk-tx__name">{a.name}</div>
                      <div className="sk-cap">{a.maturesOn ? `Matures ${fmtShort(a.maturesOn)}` : (a.note ?? kindLabel(a.kind))}</div>
                    </div>
                    <div className="right">
                      <div className="sk-tx__amt">{cedis(a.balanceMinor)}</div>
                      <div className="sk-cap">{a.goalMinor ? `goal ${cedis(a.goalMinor)}` : a.expectedReturnMinor ? `+${cedis(a.expectedReturnMinor)} due` : `updated ${relDay(a.updatedAt.toISOString().slice(0, 10)).toLowerCase()}`}</div>
                    </div>
                    <Dialog label={<Icon name="more" />} ariaLabel={`Manage ${a.name}`} title={a.name} triggerClassName="sk-iconbtn">
                      <ActionForm action={moveSavings} className="sk-stack" reset>
                        <input type="hidden" name="id" value={a.id} />
                        <div className="sk-seg" role="radiogroup" aria-label="Direction">
                          <label><input type="radio" name="direction" value="in" defaultChecked />Put in</label>
                          <label><input type="radio" name="direction" value="out" />Take out</label>
                        </div>
                        <Field name="amount" label="Amount (GH₵)" inputMode="decimal" required />
                        <label className="sk-between" style={{ cursor: "pointer" }}>
                          <span>
                            <b>Count as saving this month</b>
                            <div className="sk-cap">Logs it in your Savings bucket</div>
                          </span>
                          <input type="checkbox" className="sk-toggle" name="log" defaultChecked />
                        </label>
                        <Submit>Update balance</Submit>
                      </ActionForm>
                      <details>
                        <summary className="sk-link" style={{ cursor: "pointer" }}>Edit details</summary>
                        <div style={{ marginTop: 12 }}><AccountForm a={a} /></div>
                      </details>
                      <ActionButton action={deleteAccount} fields={{ id: a.id }} className="sk-btn sk-btn--danger sk-btn--block" confirm={`Remove ${a.name}?`}>
                        Remove
                      </ActionButton>
                    </Dialog>
                  </div>
                  {a.goalMinor ? <div style={{ marginTop: 8 }}><Bar value={a.balanceMinor} max={a.goalMinor} tone="savings" thin /></div> : null}
                </div>
              ))
            ) : (
              <Empty icon={<Icon name="wallet" />} title="Where do you keep savings?">
                Add a savings account, T-bill, susu or MoMo wallet to track it here.
              </Empty>
            )}
          </div>
        </div>
        <div className="sk-card sk-card--flat sk-card--pad sk-stack hide-mobile" style={{ alignSelf: "start" }}>
          <b>How saving works here</b>
          <p className="sk-cap">Your Savings bucket is the plan. When you put money into a place and keep &ldquo;Count as saving&rdquo; on, it counts toward this month&apos;s target.</p>
        </div>
      </div>
    </>
  );
}
