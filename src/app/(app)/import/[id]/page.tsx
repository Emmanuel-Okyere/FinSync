import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, importBatches, savingsAccounts } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { fmtShort } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { ActionForm, Submit } from "@/components/forms";
import { PageHead } from "@/components/app/PageHead";
import { confirmImport, discardImport } from "../../_actions/import";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ImportReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string }> }) {
  const { id } = await params;
  const showAll = (await searchParams).all === "1";
  if (!UUID.test(id)) notFound();
  const user = await requireOnboardedUser();
  const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.userId, user.id)));
  if (!batch) notFound();
  if (batch.status === "done") redirect(`/import/${id}/done`);
  const cats = await db.select().from(categories).where(and(eq(categories.userId, user.id), eq(categories.archived, false))).orderBy(categories.name);
  const [account] = batch.accountId ? await db.select().from(accounts).where(eq(accounts.id, batch.accountId)) : [];
  const [saveTo] = account?.saveToId ? await db.select().from(savingsAccounts).where(eq(savingsAccounts.id, account.saveToId)) : [];
  const rows = batch.rows.map((r, i) => ({ ...r, i, isSave: Boolean(saveTo) && r.saveFor != null }));
  const saves = rows.filter((r) => r.isSave);
  const needsLook = rows.filter((r) => (!r.categoryId && !r.isSave) || r.duplicate);
  const dates = rows.map((r) => r.occurredOn).sort();
  const included = rows.filter((r) => r.include).length;

  return (
    <>
      <PageHead title="Check entries" back="/import" add={false} search={false} sub={`${account?.name ?? (batch.source === "momo" ? "MoMo" : "Bank")} · ${fmtShort(dates[0])}–${fmtShort(dates[dates.length - 1])}`} />
      <div className="sk-grid g-3" style={{ maxWidth: 720 }}>
        <div className="sk-mini sk-mini--2"><small>Found</small><b>{rows.length}</b></div>
        <div className="sk-mini sk-mini--2"><small>Need a category</small><b>{rows.filter((r) => !r.categoryId && !r.isSave).length}</b></div>
        <div className="sk-mini sk-mini--2"><small>Already logged</small><b>{rows.filter((r) => r.duplicate).length}</b></div>
      </div>
      {saves.length ? (
        <p className="sk-cap" style={{ maxWidth: 720 }}>
          {saves.length} automatic saving{saves.length === 1 ? "" : "s"} to {saveTo!.name} (GH₵ {cedis(saves.reduce((s, r) => s + r.amountMinor, 0))}) will be matched to their payments and added to its balance, not counted as spending. Untick one to leave it out.
        </p>
      ) : null}
      <nav className="sk-seg" style={{ maxWidth: 420 }}>
        <Link href={`/import/${id}`} className={!showAll ? "is-on" : ""}>Needs a look ({needsLook.length})</Link>
        <Link href={`/import/${id}?all=1`} className={showAll ? "is-on" : ""}>All ({rows.length})</Link>
      </nav>
      <ActionForm action={confirmImport} className="sk-stack">
        <input type="hidden" name="id" value={id} />
        <div className="sk-card sk-card--pad">
          <div className="sk-tablewrap">
            <table className="sk-table">
              <thead><tr><th>Add</th><th>Entry</th><th>Category</th><th className="r">Amount</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const visible = showAll || (!r.categoryId && !r.isSave) || r.duplicate;
                  return (
                    <tr key={r.i} style={visible ? undefined : { display: "none" }}>
                      <td><input type="checkbox" name={`inc_${r.i}`} defaultChecked={r.include} aria-label={`Import ${r.name}`} style={{ width: 20, height: 20, accentColor: "var(--brand)" }} /></td>
                      <td>
                        <b style={{ fontWeight: 600 }}>{r.name}</b>
                        <div className="sk-cap">{fmtShort(r.occurredOn)}{r.duplicate ? " · " : ""}{r.duplicate ? <span className="sk-tag sk-tag--pace">Possible duplicate</span> : null}</div>
                      </td>
                      <td>
                        {r.isSave ? (
                          <span className="sk-tag sk-tag--under">Saved to {saveTo!.name}{r.saveFor != null ? ` · for ${batch.rows[r.saveFor].name}` : ""}</span>
                        ) : (
                        <select name={`cat_${r.i}`} defaultValue={r.categoryId ?? ""} className="sk-cellin" style={{ width: 170, textAlign: "left", boxShadow: r.categoryId ? undefined : "inset 0 0 0 2px var(--accent)" }} aria-label={`Category for ${r.name}`}>
                          <option value="">Pick a category</option>
                          {cats.filter((c) => c.kind === r.kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        )}
                      </td>
                      <td className={`r ${r.kind === "income" ? "t-income" : ""}`}>{r.kind === "income" ? "+" : "−"}{cedis(r.amountMinor, 2)}{r.feeMinor ? <span className="sk-cap" style={{ display: "block" }}>+{cedis(r.feeMinor, 2)} charge</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="sk-row sk-wrap" style={{ gap: 10 }}>
          <Submit className="sk-btn" pendingText="Importing…">Import ticked entries ({included} suggested)</Submit>
        </div>
      </ActionForm>
      <ActionForm action={discardImport}>
        <input type="hidden" name="id" value={id} />
        <Submit className="sk-btn sk-btn--ghost">Discard this import</Submit>
      </ActionForm>
    </>
  );
}
