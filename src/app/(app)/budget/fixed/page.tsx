import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { categories, fixedExpenses, transactions } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { incomeTotal } from "@/lib/budget";
import { monthEnd, monthStart, todayISO, dayOf } from "@/lib/dates";
import { cedis, toInputValue } from "@/lib/money";
import { ActionButton, ActionForm, Dialog, Field, SelectField, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { Amount, Empty } from "@/components/app/ui";
import { AutoSubmitToggle } from "@/components/app/AutoSubmitToggle";
import { deleteFixedExpense, saveFixedExpense, setAutoAddFixed, toggleFixedExpense } from "../../_actions/budget";

export const metadata = { title: "Fixed expenses · FinSync" };

const ord = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

export default async function Fixed() {
  const user = await requireOnboardedUser();
  const today = todayISO();
  const month = monthStart(today);
  const [rows, cats, logged, income] = await Promise.all([
    db
      .select({ f: fixedExpenses, catName: categories.name, icon: categories.icon, bucket: categories.bucket })
      .from(fixedExpenses)
      .innerJoin(categories, eq(categories.id, fixedExpenses.categoryId))
      .where(eq(fixedExpenses.userId, user.id))
      .orderBy(fixedExpenses.dayOfMonth),
    db.select().from(categories).where(and(eq(categories.userId, user.id), eq(categories.kind, "expense"), eq(categories.archived, false))).orderBy(categories.name),
    db
      .select({ id: transactions.fixedExpenseId })
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), isNotNull(transactions.fixedExpenseId), gte(transactions.occurredOn, month), lte(transactions.occurredOn, monthEnd(month)))),
    incomeTotal(user.id),
  ]);
  const loggedIds = new Set(logged.map((l) => l.id));
  const active = rows.filter((r) => r.f.active);
  const total = active.reduce((s, r) => s + r.f.amountMinor, 0);
  const byBucket = (b: string) => active.filter((r) => r.bucket === b).reduce((s, r) => s + r.f.amountMinor, 0);
  const catOptions = cats.map((c) => ({ value: c.id, label: c.name }));

  const form = (f?: (typeof rows)[number]["f"]) => (
    <ActionForm action={saveFixedExpense} className="sk-stack" reset={!f}>
      {f ? <input type="hidden" name="id" value={f.id} /> : null}
      <Field name="name" label="Name" required defaultValue={f?.name} maxLength={60} placeholder="e.g. Rent" />
      <SelectField name="categoryId" label="Category" options={catOptions} defaultValue={f?.categoryId} />
      <div className="sk-grid g-2" style={{ gap: 10 }}>
        <Field name="amount" label="Each month (GH₵)" inputMode="decimal" required defaultValue={f ? toInputValue(f.amountMinor) : ""} />
        <Field name="day" label="Day of month" type="number" min={1} max={31} defaultValue={f?.dayOfMonth ?? ""} hint="Leave blank if it varies" />
      </div>
      <Submit>{f ? "Save changes" : "Add fixed expense"}</Submit>
    </ActionForm>
  );

  return (
    <>
      <PageHead title="Fixed expenses" back="/budget" sub="Costs that leave every month">
        <Dialog label={<><Icon name="plus" />Add</>} title="New fixed expense" triggerClassName="sk-btn sk-btn--sm sk-btn--quiet">
          {form()}
        </Dialog>
      </PageHead>
      <div className="sk-grid g-main">
        <div className="sk-card sk-card--pad">
          {rows.length ? (
            rows.map(({ f, catName, icon, bucket }) => {
              const isLogged = loggedIds.has(f.id);
              const due = f.dayOfMonth && f.dayOfMonth > dayOf(today);
              return (
                <div key={f.id} className="sk-tx" style={{ opacity: f.active ? 1 : 0.55 }}>
                  <div className={`sk-tile sk-tile--${bucket === "wants" ? "wants" : bucket === "savings" ? "savings" : "needs"}`}><Icon name={icon} /></div>
                  <div className="sk-tx__main">
                    <div className="sk-tx__name">{f.name}</div>
                    <div className="sk-cap">{f.dayOfMonth ? ord(f.dayOfMonth) : "Varies"} · {catName}</div>
                  </div>
                  <div className="right">
                    <div className="sk-tx__amt">{cedis(f.amountMinor)}</div>
                    {!f.active ? <span className="sk-tag sk-tag--pace">Paused</span> : isLogged ? <span className="sk-tag sk-tag--under"><Icon name="check" />Logged</span> : due ? <span className="sk-tag sk-tag--pace">Due {ord(f.dayOfMonth!)}</span> : <span className="sk-tag sk-tag--needs">Not logged</span>}
                  </div>
                  <Dialog label={<Icon name="edit" />} ariaLabel={`Edit ${f.name}`} title={`Edit ${f.name}`} triggerClassName="sk-iconbtn">
                    {form(f)}
                    <div className="sk-grid g-2" style={{ gap: 10 }}>
                      <ActionButton action={toggleFixedExpense} fields={{ id: f.id }} className="sk-btn sk-btn--ghost">{f.active ? "Pause" : "Resume"}</ActionButton>
                      <ActionButton action={deleteFixedExpense} fields={{ id: f.id }} className="sk-btn sk-btn--danger" confirm={{ title: `Delete ${f.name}?`, body: "It won't be added to future budgets. Past entries stay.", confirmLabel: "Delete", danger: true }}>Delete</ActionButton>
                    </div>
                  </Dialog>
                </div>
              );
            })
          ) : (
            <Empty title="No fixed expenses">Add rent, bills and subscriptions so each month starts planned.</Empty>
          )}
        </div>
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack" style={{ gap: 8 }}>
            <div className="sk-over">Leaves every month</div>
            <Amount minor={total} style={{ fontSize: 34, lineHeight: "40px" }} />
            <div className="sk-cap">{income ? Math.round((total / income) * 100) : 0}% of take-home pay, before you buy anything else.</div>
            <div className="sk-stackbar">
              <i className="b-needs" style={{ flex: byBucket("needs") || 0.0001 }} />
              <i className="b-wants" style={{ flex: byBucket("wants") || 0.0001 }} />
              <i style={{ flex: Math.max(0, income - total) || 0.0001, background: "var(--surface-2)" }} />
            </div>
            <div className="sk-row sk-cap" style={{ gap: 14 }}>
              <span className="sk-row"><i className="sk-dot b-needs" />Needs {cedis(byBucket("needs"))}</span>
              <span className="sk-row"><i className="sk-dot b-wants" />Wants {cedis(byBucket("wants"))}</span>
            </div>
          </div>
          <ActionForm action={setAutoAddFixed} className="sk-card sk-card--pad">
            <label className="sk-between" style={{ cursor: "pointer" }}>
              <div>
                <b>Log them on their day</b>
                <div className="sk-cap">Each month starts with these lines filled in, and they&apos;re logged when due</div>
              </div>
              <AutoSubmitToggle name="on" defaultChecked={user.settings.autoAddFixed} />
            </label>
          </ActionForm>
        </div>
      </div>
    </>
  );
}

