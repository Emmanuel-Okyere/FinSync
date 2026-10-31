import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, savingsAccounts } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { userAccounts } from "@/lib/accounts";
import { ACCOUNT_KINDS, feeRules } from "@/lib/fees";
import { cedis } from "@/lib/money";
import { ActionButton, Dialog } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { Empty } from "@/components/app/ui";
import { AccountForm } from "@/components/app/AccountForm";
import { archiveAccount } from "../../_actions/accounts";

export const metadata = { title: "Accounts · FinSync" };

const ICON: Record<string, string> = { bank: "bank", momo: "phone", card: "card", ghanapay: "phone", cash: "wallet", other: "wallet" };

export default async function Accounts() {
  const user = await requireOnboardedUser();
  const [list, savings, cats] = await Promise.all([
    userAccounts(user.id),
    db.select({ id: savingsAccounts.id, name: savingsAccounts.name }).from(savingsAccounts).where(eq(savingsAccounts.userId, user.id)).orderBy(savingsAccounts.name),
    db
      .select({ id: categories.id, name: categories.name, bucket: categories.bucket })
      .from(categories)
      .where(and(eq(categories.userId, user.id), eq(categories.kind, "expense"), eq(categories.archived, false)))
      .orderBy(categories.name),
  ]);
  const rules = feeRules(user.settings.fees);
  const savingsName = new Map(savings.map((s) => [s.id, s.name]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const debtId = cats.find((c) => c.name === "Debt repayment")?.id;
  const form = (a?: (typeof list)[number]) => <AccountForm a={a} rules={rules} savings={savings} categories={cats} debtCategoryId={debtId} />;

  return (
    <>
      <PageHead title="Accounts" back="/settings" sub="Where your money moves from: named like buckets" add={false} search={false}>
        <Dialog label={<><Icon name="plus" />Add</>} title="New account" triggerClassName="sk-btn sk-btn--sm sk-btn--quiet">
          {form()}
        </Dialog>
      </PageHead>
      <div className="sk-grid g-main">
        <div className="sk-card sk-card--pad">
          {list.length ? (
            list.map((a) => {
              const kind = ACCOUNT_KINDS.find((k) => k.value === a.kind)?.label ?? a.kind;
              const fee = a.kind === "cash" ? "no charges" : !a.fee ? "usual charges" : a.fee.pct === 0 ? "no charges" : `${a.fee.pct}%${a.fee.cap ? ` up to ${cedis(a.fee.cap, 2)}` : ""} charge`;
              const save = a.saveToId && a.saveMinor ? `GH₵ ${cedis(a.saveMinor)} to ${savingsName.get(a.saveToId) ?? "savings"} per payment${a.saveExcept.length ? ` (not ${a.saveExcept.map((id) => catName.get(id)).filter(Boolean).join(", ")})` : ""}` : null;
              return (
                <div key={a.id} className="sk-tx">
                  <span className="sk-tile sk-tile--sm"><Icon name={ICON[a.kind] ?? "wallet"} /></span>
                  <div className="sk-tx__main">
                    <div className="sk-tx__name">{a.name}{a.last4 ? <span className="sk-cap"> ···{a.last4}</span> : null}</div>
                    <div className="sk-cap">{kind} · {fee}</div>
                    {save ? <div className="sk-cap t-income">{save}</div> : null}
                  </div>
                  <Dialog label={<Icon name="edit" />} ariaLabel={`Edit ${a.name}`} title={`Edit ${a.name}`} triggerClassName="sk-iconbtn">
                    {form(a)}
                    <ActionButton action={archiveAccount} fields={{ id: a.id }} className="sk-btn sk-btn--danger sk-btn--block" confirm={{ title: `Remove ${a.name}?`, body: "It won't be offered when you log payments. Past entries stay as they are.", confirmLabel: "Remove", danger: true }}>
                      Remove account
                    </ActionButton>
                  </Dialog>
                </div>
              );
            })
          ) : (
            <Empty title="No accounts yet">Add the accounts you pay from, like &ldquo;Stanbic current&rdquo; or &ldquo;MTN MoMo&rdquo;. Until then, entries use plain methods (MoMo, Bank, Cash).</Empty>
          )}
        </div>
        <div className="sk-card sk-card--pad sk-cap sk-stack" style={{ gap: 6 }}>
          <b style={{ color: "var(--ink)" }}>Why accounts?</b>
          <span>Pick one under &ldquo;Paid with&rdquo; and its transfer charge and any automatic saving are added for you.</span>
          <span>FinSync never asks for account numbers. The last 4 digits are optional, only to tell two accounts at one bank apart.</span>
          <span>Automatic savings count in your Savings bucket, not as spending, and add to the savings place&apos;s balance.</span>
        </div>
      </div>
    </>
  );
}
