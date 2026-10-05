import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { incomes } from "@/db/schema";
import { signOut } from "@/app/(auth)/actions";
import { saveIncome } from "@/app/setup/actions";
import { requireOnboardedUser } from "@/lib/auth/session";
import { paydayLabel, weekendLabel, type WeekendShift } from "@/lib/dates";
import { otpEnabled } from "@/lib/env";
import { membershipOf } from "@/lib/household";
import { displayPhone } from "@/lib/phone";
import { schemeLabel } from "@/lib/schemes";
import { toInputValue } from "@/lib/money";
import { payslipItems } from "@/lib/payslip-form";
import { ActionForm, Dialog, Field, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { AutoSubmitToggle } from "@/components/app/AutoSubmitToggle";
import { AppearanceSelect } from "@/components/app/AppearanceSelect";
import { IncomeForm } from "@/components/setup/IncomeForm";
import { changePassword, changePhone, confirmPhoneChange, deleteAccount, requestPhoneChange, signOutEverywhere, updateProfile, updateSettings } from "../_actions/settings";

export const metadata = { title: "Settings · FinSync" };

function Row({ icon, label, value, href, children }: { icon: string; label: string; value?: string; href?: string; children?: React.ReactNode }) {
  const inner = (
    <>
      <span className="sk-tile sk-tile--sm"><Icon name={icon} /></span>
      <div className="sk-tx__main"><div style={{ fontWeight: 600 }}>{label}</div></div>
      {value ? <span className="sk-row sk-cap">{value}</span> : null}
      {href ? <Icon name="next" /> : null}
      {children}
    </>
  );
  return href ? <Link href={href} className="sk-tx">{inner}</Link> : <div className="sk-tx">{inner}</div>;
}

export default async function Settings() {
  const user = await requireOnboardedUser();
  const [incomeRows, household] = await Promise.all([db.select().from(incomes).where(eq(incomes.userId, user.id)).orderBy(incomes.createdAt), membershipOf(user.id)]);
  const main = incomeRows.find((r) => !r.variable);
  const s = user.settings;

  return (
    <>
      <PageHead title="Settings" add={false} search={false} />
      <div className="sk-grid g-2" style={{ alignItems: "start" }}>
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-row" style={{ gap: 14 }}>
            <span className="sk-avatar" style={{ width: 48, height: 48, fontSize: 20 }}>{user.firstName.slice(0, 1).toUpperCase()}</span>
            <div className="grow">
              <b>{user.firstName} {user.lastName}</b>
              <div className="sk-cap">{displayPhone(user.phone)}{user.email ? ` · ${user.email}` : ""}</div>
            </div>
            <Dialog label={<Icon name="edit" />} ariaLabel="Edit profile" title="Profile" triggerClassName="sk-iconbtn">
              <ActionForm action={updateProfile} className="sk-stack">
                <div className="sk-grid g-2" style={{ gap: 10 }}>
                  <Field name="firstName" label="First name" required defaultValue={user.firstName} maxLength={60} />
                  <Field name="lastName" label="Last name" defaultValue={user.lastName} maxLength={60} />
                </div>
                <Field name="email" label="Email (optional, for sign in)" type="email" defaultValue={user.email ?? ""} autoComplete="email" />
                <Submit>Save profile</Submit>
              </ActionForm>
              <details>
                <summary className="sk-link" style={{ cursor: "pointer" }}>Change phone number</summary>
                {otpEnabled() ? (
                <div className="sk-stack" style={{ marginTop: 12 }}>
                  <ActionForm action={requestPhoneChange} className="sk-stack" showOk>
                    <Field name="phone" label="New phone number" type="tel" inputMode="tel" required />
                    <Field name="current" label="Your password" type="password" autoComplete="current-password" />
                    <Submit className="sk-btn sk-btn--ghost sk-btn--block">Text me a code</Submit>
                  </ActionForm>
                  <ActionForm action={confirmPhoneChange} className="sk-stack">
                    <Field name="phone" label="New phone number (again)" type="tel" inputMode="tel" required />
                    <Field name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
                    <Submit>Confirm new number</Submit>
                  </ActionForm>
                </div>
                ) : (
                  <ActionForm action={changePhone} className="sk-stack" showOk style={{ marginTop: 12 }}>
                    <Field name="phone" label="New phone number" type="tel" inputMode="tel" required />
                    {user.passwordHash ? <Field name="current" label="Your password" type="password" autoComplete="current-password" required /> : null}
                    <Submit>Save new number</Submit>
                  </ActionForm>
                )}
              </details>
            </Dialog>
          </div>

          <div className="sk-over">Money</div>
          <div className="sk-card sk-card--pad">
            <Dialog
              title="Income and payday"
              triggerClassName="sk-tx"
              label={<><span className="sk-tile sk-tile--sm"><Icon name="calendar" /></span><span className="sk-tx__main" style={{ fontWeight: 600 }}>Income and payday</span><span className="sk-cap">{paydayLabel[user.paydayRule] ?? user.paydayRule}{(user.paydayRule === "25th" || user.paydayRule === "date") && user.paydayWeekend !== "same" ? ` · ${weekendLabel[user.paydayWeekend as WeekendShift]} if on a weekend` : ""}</span><Icon name="next" /></>}
            >
              <IncomeForm
                action={saveIncome}
                returnTo="settings"
                submitLabel="Save"
                initial={{
                  main: main ? toInputValue(main.amountMinor) : "",
                  kind: main?.kind ?? "salary",
                  payday: user.paydayRule,
                  paydayDay: user.paydayDay,
                  paydayWeekend: user.paydayWeekend,
                  payslip: main?.payslip ? { basic: toInputValue(main.payslip.basic), tier3Pct: main.payslip.tier3Pct ? String(main.payslip.tier3Pct) : "", items: payslipItems(main.payslip).map((a) => ({ name: a.name ?? "", amount: toInputValue(a.amount), per: a.per })) } : null,
                  extras: incomeRows.filter((r) => r.variable).map((r) => ({ name: r.name, amount: toInputValue(r.amountMinor) })),
                }}
              />
              <p className="sk-cap">New income applies from the next month you open; this month&apos;s plan keeps its numbers.</p>
            </Dialog>
            <Row icon="calculator" label="Tax and SSNIT calculator" href="/tax" />
            <Row icon="sliders" label="Scheme" value={schemeLabel(user.scheme)} href="/budget#scheme" />
            <Row icon="repeat" label="Fixed expenses" href="/budget/fixed" />
            <Row icon="wallet" label="Currency" value="GH₵ (Ghana cedi)" />
            <Row icon="upload" label="Import statements" href="/import" />
            <Row icon="users" label="Household" value={household?.h.name ?? "Not set up"} href="/household" />
            <a className="sk-tx" href={`/api/export?from=2000-01-01&to=2100-12-31`}>
              <span className="sk-tile sk-tile--sm"><Icon name="download" /></span>
              <div className="sk-tx__main" style={{ fontWeight: 600 }}>Export all entries (CSV)</div>
            </a>
          </div>
        </div>

        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-over">Alerts by SMS</div>
          <ActionForm action={updateSettings} className="sk-card sk-card--pad">
            {([
              ["overBudgetAlerts", "bell", "Over-budget warnings", s.overBudgetAlerts],
              ["billReminders", "calendar", "Bill due reminders", s.billReminders],
              ["dailySafeToSpend", "message", "Daily safe-to-spend at 8am", s.dailySafeToSpend],
              ["autoAddFixed", "repeat", "Log fixed costs on their day", s.autoAddFixed],
            ] as const).map(([name, icon, label, on]) => (
              <label key={name} className="sk-tx" style={{ cursor: "pointer" }}>
                <span className="sk-tile sk-tile--sm"><Icon name={icon} /></span>
                <span className="sk-tx__main" style={{ fontWeight: 600 }}>{label}</span>
                <AutoSubmitToggle name={name} defaultChecked={on} />
              </label>
            ))}
            <div className="sk-tx">
              <span className="sk-tile sk-tile--sm"><Icon name="moon" /></span>
              <label className="sk-tx__main" style={{ fontWeight: 600 }} htmlFor="appearance">Appearance</label>
              <AppearanceSelect value={s.appearance} />
            </div>
          </ActionForm>

          <div className="sk-over">Security</div>
          <div className="sk-card sk-card--pad">
            <Dialog title="Change password" triggerClassName="sk-tx" label={<><span className="sk-tile sk-tile--sm"><Icon name="lock" /></span><span className="sk-tx__main" style={{ fontWeight: 600 }}>Change password</span><Icon name="next" /></>}>
              <ActionForm action={changePassword} className="sk-stack" showOk reset>
                {user.passwordHash ? <Field name="current" label="Current password" type="password" autoComplete="current-password" required /> : null}
                <Field name="password" label="New password" type="password" autoComplete="new-password" required hint="At least 10 characters." />
                <Submit>Change password</Submit>
              </ActionForm>
            </Dialog>
            <form action={signOutEverywhere}>
              <button className="sk-tx" type="submit"><span className="sk-tile sk-tile--sm"><Icon name="fingerprint" /></span><span className="sk-tx__main" style={{ fontWeight: 600 }}>Sign out on all devices</span></button>
            </form>
            <form action={signOut}>
              <button className="sk-tx" type="submit"><span className="sk-tile sk-tile--sm"><Icon name="logout" /></span><span className="sk-tx__main" style={{ fontWeight: 600 }}>Sign out</span></button>
            </form>
            <Dialog title="Delete account" triggerClassName="sk-tx" label={<><span className="sk-tile sk-tile--sm sk-tile--over"><Icon name="trash" /></span><span className="sk-tx__main t-expense" style={{ fontWeight: 600 }}>Delete account</span></>}>
              <p className="sk-cap">This permanently deletes your budget, entries, savings, debts, investments and policies. It can&apos;t be undone.</p>
              <ActionForm action={deleteAccount} className="sk-stack">
                {user.passwordHash ? <Field name="current" label="Your password" type="password" autoComplete="current-password" required /> : null}
                <Field name="confirm" label='Type "DELETE" to confirm' required />
                <Submit className="sk-btn sk-btn--danger sk-btn--block">Delete my account</Submit>
              </ActionForm>
            </Dialog>
          </div>
        </div>
      </div>
    </>
  );
}

