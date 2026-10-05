import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions, users } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { fmtMonth, monthEnd, monthStart, relDay, todayISO } from "@/lib/dates";
import { balances, membershipOf, pendingInvitesFor } from "@/lib/household";
import { cedis, toInputValue } from "@/lib/money";
import { ActionButton, ActionForm, Dialog, Field, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { Bar, Empty } from "@/components/app/ui";
import { acceptInvite, createHousehold, inviteMember, leaveHousehold, settleUp, updateHousehold } from "../_actions/household";

export const metadata = { title: "Household · FinSync" };

export default async function Household() {
  const user = await requireOnboardedUser();
  const m = await membershipOf(user.id);
  const invites = await pendingInvitesFor(user.phoneVerifiedAt ? user.phone : null);

  if (!m) {
    return (
      <>
        <PageHead title="Household" back="/settings" add={false} />
        {invites.map((i) => (
          <div key={i.id} className="sk-cut">
            <div className="sk-tile sk-tile--savings"><Icon name="users" /></div>
            <div className="sk-cut__body">
              <b>{i.by} invited you to {i.name}</b>
              <span className="sk-cap">Share a budget and split costs 50 / 50.</span>
              <div><ActionButton action={acceptInvite} fields={{ id: i.id }}>Join</ActionButton></div>
            </div>
          </div>
        ))}
        <div className="sk-card sk-card--pad sk-stack" style={{ maxWidth: 560 }}>
          <b className="sk-h">Share a budget</b>
          <p className="sk-cap">Create a household to track shared costs like rent and market runs with a partner or housemates. Each person keeps their own budget.</p>
          <ActionForm action={createHousehold} className="sk-stack">
            <Field name="name" label="Household name" required placeholder={`${user.lastName || user.firstName} home`} maxLength={60} />
            <Field name="limit" label="Shared spending limit a month (GH₵, optional)" inputMode="decimal" />
            <Submit>Create household</Submit>
          </ActionForm>
        </div>
      </>
    );
  }

  const month = monthStart(todayISO());
  const [{ members, net }, shared] = await Promise.all([
    balances(m.householdId),
    db
      .select({ id: transactions.id, name: transactions.name, amount: transactions.amountMinor, occurredOn: transactions.occurredOn, userId: transactions.userId, payer: users.firstName, icon: categories.icon, bucket: categories.bucket })
      .from(transactions)
      .innerJoin(users, eq(users.id, transactions.userId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(eq(transactions.householdId, m.householdId), eq(transactions.kind, "expense"), gte(transactions.occurredOn, month), lte(transactions.occurredOn, monthEnd(month))))
      .orderBy(desc(transactions.occurredOn))
      .limit(100),
  ]);
  const total = shared.reduce((s, t) => s + t.amount, 0);
  const paidBy = new Map<string, number>();
  for (const t of shared) paidBy.set(t.userId, (paidBy.get(t.userId) ?? 0) + t.amount);
  const mine = net.get(user.id) ?? 0;
  const others = members.filter((x) => x.id !== user.id);
  const split = members.length ? Math.round(100 / members.length) : 100;

  return (
    <>
      <PageHead title={m.h.name} back="/settings" sub={`Shared budget · ${fmtMonth(month)}`}>
        {m.role === "owner" ? (
          <Dialog label={<Icon name="settings" />} ariaLabel="Household settings" title="Household settings" triggerClassName="sk-iconbtn">
            <ActionForm action={updateHousehold} className="sk-stack">
              <Field name="name" label="Name" required defaultValue={m.h.name} maxLength={60} />
              <Field name="limit" label="Shared spending limit a month (GH₵)" inputMode="decimal" defaultValue={toInputValue(m.h.monthlyLimitMinor || null)} />
              <Submit>Save</Submit>
            </ActionForm>
          </Dialog>
        ) : null}
      </PageHead>

      <div className="sk-row sk-wrap" style={{ gap: 10 }}>
        <div className="sk-row" style={{ gap: 0 }}>
          {members.map((x, i) => (
            <span key={x.id} className={`sk-avatar${i % 2 ? " sk-avatar--b" : ""}`} style={{ marginLeft: i ? -8 : 0, boxShadow: "0 0 0 3px var(--canvas)" }}>{x.firstName.slice(0, 1)}</span>
          ))}
        </div>
        <span className="sk-cap">{members.map((x) => x.firstName).join(" and ")} ·</span>
        <Dialog label="Invite" title="Invite someone" triggerClassName="sk-link">
          <ActionForm action={inviteMember} className="sk-stack" reset>
            <Field name="phone" label="Their phone number" type="tel" inputMode="tel" required placeholder="024 555 0192" />
            <p className="sk-cap">We&apos;ll text them. They join by signing in with that number.</p>
            <Submit>Send invite</Submit>
          </ActionForm>
        </Dialog>
      </div>

      <div className="sk-grid g-main">
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack">
            <div className="sk-between">
              <b>Shared spending</b>
              <span className="sk-cap">{cedis(total)}{m.h.monthlyLimitMinor ? ` of ${cedis(m.h.monthlyLimitMinor)}` : ""}</span>
            </div>
            {m.h.monthlyLimitMinor ? <Bar value={total} max={m.h.monthlyLimitMinor} /> : null}
            <div className="sk-grid" style={{ gridTemplateColumns: `repeat(${Math.min(members.length, 4)}, minmax(0,1fr))`, gap: 10 }}>
              {members.map((x) => (
                <div key={x.id} className="sk-mini sk-mini--2"><small>{x.id === user.id ? "You" : x.firstName} paid</small><b>{cedis(paidBy.get(x.id) ?? 0)}</b></div>
              ))}
            </div>
          </div>
          <div className="sk-card sk-card--pad">
            {shared.length ? (
              shared.map((t) => (
                <div key={t.id} className="sk-tx">
                  <div className={`sk-tile sk-tile--${t.bucket === "wants" ? "wants" : "needs"}`}><Icon name={t.icon ?? "tag"} /></div>
                  <div className="sk-tx__main">
                    <div className="sk-tx__name">{t.name}</div>
                    <div className="sk-cap">{t.userId === user.id ? "You" : t.payer} paid · {relDay(t.occurredOn)} · {members.map(() => split).join(" / ")}</div>
                  </div>
                  <div className="sk-tx__amt">{cedis(t.amount)}</div>
                </div>
              ))
            ) : (
              <Empty title="No shared costs this month">When you add an expense, switch on &ldquo;Shared with household&rdquo;.</Empty>
            )}
          </div>
        </div>
        <div className="sk-stack" style={{ gap: 16 }}>
          {others.map((o) => {
            const theirs = net.get(o.id) ?? 0;
            // With two people this is exact; with more, show what each person is up or down overall.
            const owesYou = members.length === 2 ? mine : 0;
            if (members.length === 2) {
              if (Math.abs(owesYou) < 100) return <div key={o.id} className="sk-card sk-card--pad"><b>You and {o.firstName} are square</b></div>;
              const from = owesYou > 0 ? o.id : user.id;
              const to = owesYou > 0 ? user.id : o.id;
              return (
                <div key={o.id} className="sk-card sk-card--pad sk-between">
                  <div>
                    <b>{owesYou > 0 ? `${o.firstName} owes you GH₵ ${cedis(owesYou)}` : `You owe ${o.firstName} GH₵ ${cedis(-owesYou)}`}</b>
                    <div className="sk-cap">Splits are {split} / {split}</div>
                  </div>
                  <ActionButton action={settleUp} fields={{ from, to, amount: (Math.abs(owesYou) / 100).toFixed(2) }} confirm={{ title: "Mark this balance as paid?", body: "Do this once the money has changed hands. It resets what you owe each other.", confirmLabel: "Settle up" }}>Settle up</ActionButton>
                </div>
              );
            }
            return (
              <div key={o.id} className="sk-card sk-card--pad sk-between">
                <span>{o.firstName}</span>
                <b className={theirs >= 0 ? "t-income" : "t-expense"}>{theirs >= 0 ? "+" : "−"}GH₵ {cedis(Math.abs(theirs))}</b>
              </div>
            );
          })}
          <ActionForm action={leaveHousehold}>
            <Submit className="sk-btn sk-btn--danger sk-btn--block">Leave household</Submit>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
