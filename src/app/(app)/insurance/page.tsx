import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { insurancePolicies } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { diffDays, fmtMonth, fmtShort, monthStart, todayISO } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { ActionButton, Dialog } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { MoneyTabs } from "@/components/app/MoneyTabs";
import { PageHead } from "@/components/app/PageHead";
import { POLICY_ICON, PolicyForm } from "@/components/app/PolicyForm";
import { Amount, Empty } from "@/components/app/ui";
import { addPremiumToBudget } from "../_actions/wealth";

export const metadata = { title: "Insurance · FinSync" };

export default async function Insurance() {
  const user = await requireOnboardedUser();
  const today = todayISO();
  const policies = await db.select().from(insurancePolicies).where(eq(insurancePolicies.userId, user.id)).orderBy(insurancePolicies.renewsOn);
  const avg = policies.reduce((s, p) => s + (p.frequency === "monthly" ? p.premiumMinor : Math.round(p.premiumMinor / 12)), 0);
  const upcoming = policies.find((p) => p.frequency === "yearly" && p.renewsOn && diffDays(today, p.renewsOn) >= 0 && diffDays(today, p.renewsOn) <= 60);

  return (
    <>
      <PageHead title="Insurance">
        <Dialog label={<Icon name="plus" />} ariaLabel="Add policy" title="Add a policy" triggerClassName="sk-iconbtn">
          <PolicyForm />
        </Dialog>
      </PageHead>
      <MoneyTabs on="/insurance" />
      <div className="sk-grid g-main">
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack" style={{ gap: 6 }}>
            <div className="sk-over">Premiums</div>
            <Amount minor={avg} style={{ fontSize: 34, lineHeight: "40px" }} />
            <div className="sk-cap">a month on average · {policies.length} polic{policies.length === 1 ? "y" : "ies"}</div>
            <p className="sk-cap">Premiums are expenses in Needs. Monthly ones are added to your budget on the 1st; yearly ones on their due month.</p>
          </div>
          {upcoming ? (
            <div className="sk-cut">
              <div className="sk-tile sk-tile--wants"><Icon name="bell" /></div>
              <div className="sk-cut__body">
                <b>{upcoming.name} renews {fmtShort(upcoming.renewsOn!)}</b>
                <span className="sk-cap">GH₵ {cedis(upcoming.premiumMinor)} due in {diffDays(today, upcoming.renewsOn!)} days. Add it to {fmtMonth(monthStart(upcoming.renewsOn!))}&apos;s budget?</span>
                <div className="sk-row">
                  <ActionButton action={addPremiumToBudget} fields={{ id: upcoming.id }}>Add to {fmtMonth(monthStart(upcoming.renewsOn!))}</ActionButton>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="sk-card sk-card--pad">
          {policies.length ? (
            policies.map((p) => {
              const days = p.renewsOn ? diffDays(today, p.renewsOn) : null;
              return (
                <Link key={p.id} href={`/insurance/${p.id}`} className="sk-tx">
                  <div className="sk-tile sk-tile--needs"><Icon name={POLICY_ICON[p.type] ?? "umbrella"} /></div>
                  <div className="sk-tx__main">
                    <div className="sk-row"><span className="sk-tx__name">{p.name}</span>{days != null && days >= 0 && days <= 60 ? <span className="sk-tag sk-tag--pace">{days} days</span> : null}</div>
                    <div className="sk-cap">{[p.coverText, p.renewsOn ? `renews ${fmtShort(p.renewsOn)}` : null].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="right">
                    <div className="sk-tx__amt">{cedis(p.premiumMinor)}/{p.frequency === "monthly" ? "mo" : "yr"}</div>
                    <div className="sk-cap">premium</div>
                  </div>
                </Link>
              );
            })
          ) : (
            <Empty icon={<Icon name="umbrella" />} title="No policies yet">Add health, car, life, funeral or NHIS cover to plan premiums.</Empty>
          )}
        </div>
      </div>
    </>
  );
}
