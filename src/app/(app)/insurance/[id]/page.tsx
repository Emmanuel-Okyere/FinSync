import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { insurancePolicies, transactions } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { diffDays, fmtLong, fmtMonth, monthStart, todayISO } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { ActionButton, Dialog } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { PolicyForm } from "@/components/app/PolicyForm";
import { METHOD_LABEL } from "@/components/app/ui";
import { addPremiumToBudget, deletePolicy } from "../../_actions/wealth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PolicyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireOnboardedUser();
  const [p] = await db.select().from(insurancePolicies).where(and(eq(insurancePolicies.id, id), eq(insurancePolicies.userId, user.id)));
  if (!p) notFound();
  const [lastPaid] = await db.select().from(transactions).where(and(eq(transactions.userId, user.id), eq(transactions.insurancePolicyId, p.id))).orderBy(desc(transactions.occurredOn)).limit(1);
  const today = todayISO();
  const days = p.renewsOn ? diffDays(today, p.renewsOn) : null;
  const rows: [string, string][] = [
    ["Insurer", p.insurer ?? "—"],
    ["Policy number", p.policyNumber ?? "—"],
    ...(p.details ? ([["Details", p.details]] as [string, string][]) : []),
    ...(p.excessMinor != null ? ([["Excess", `GH₵ ${cedis(p.excessMinor)}`]] as [string, string][]) : []),
    ["Paid as", "Expense · Needs · Insurance"],
    ["Last paid", lastPaid ? `${fmtLong(lastPaid.occurredOn)} · ${METHOD_LABEL[lastPaid.method] ?? lastPaid.method}` : p.lastPaidOn ? fmtLong(p.lastPaidOn) : "Not logged yet"],
  ];

  return (
    <>
      <PageHead title={p.name} back="/insurance" add={false}>
        <Dialog label={<Icon name="edit" />} ariaLabel="Edit policy" title={`Edit ${p.name}`} triggerClassName="sk-iconbtn">
          <PolicyForm p={p} />
          <ActionButton action={deletePolicy} fields={{ id: p.id }} className="sk-btn sk-btn--danger sk-btn--block" confirm={{ title: `Delete ${p.name}?`, body: "Its monthly premium will stop being added to your budget. Past entries stay.", confirmLabel: "Delete", danger: true }}>Delete policy</ActionButton>
        </Dialog>
      </PageHead>
      <div className="sk-grid g-2">
        <div className="sk-hero sk-stack" style={{ gap: 6 }}>
          <div className="sk-hero__deco" />
          <div className="sk-over">{days != null && days >= 0 ? `Renews in ${days} day${days === 1 ? "" : "s"}` : "Renewal date"}</div>
          <div className="sk-num" style={{ fontSize: 28 }}>{p.renewsOn ? fmtLong(p.renewsOn) : "Not set"}</div>
          <div className="sk-cap">GH₵ {cedis(p.premiumMinor)} a {p.frequency === "monthly" ? "month" : "year"}{p.coverText ? ` · ${p.coverText.toLowerCase()}` : ""}</div>
        </div>
        <div className="sk-card sk-card--pad">
          {rows.map(([k, v]) => (
            <div key={k} className="sk-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <span className="sk-cap">{k}</span>
              <b className="right">{v}</b>
            </div>
          ))}
        </div>
      </div>
      {p.frequency === "yearly" ? (
        <div className="sk-row" style={{ maxWidth: 420 }}>
          <ActionButton action={addPremiumToBudget} fields={{ id: p.id }} className="sk-btn sk-btn--block">
            Add to {fmtMonth(monthStart(p.renewsOn && p.renewsOn >= today ? p.renewsOn : today))}&apos;s budget
          </ActionButton>
        </div>
      ) : null}
    </>
  );
}
