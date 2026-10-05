import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { importBatches } from "@/db/schema";
import { requireOnboardedUser } from "@/lib/auth/session";
import { cutSuggestions, monthView } from "@/lib/budget";
import { fmtMonth, monthStart, todayISO } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { Icon } from "@/components/Icon";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ImportDone({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireOnboardedUser();
  const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.userId, user.id)));
  if (!batch || batch.status !== "done") notFound();
  const month = monthStart(todayISO());
  const v = await monthView(user, month);
  const over = v.lines.filter((l) => l.actual > l.planned).sort((a, b) => b.actual - b.planned - (a.actual - a.planned))[0];
  const skipped = batch.rows.length - batch.importedCount;
  const cuts = cutSuggestions(v);

  return (
    <div className="sk-stack" style={{ maxWidth: 520, margin: "24px auto", gap: 16, textAlign: "center", alignItems: "center" }}>
      <span className="sk-tile sk-tile--income" style={{ width: 64, height: 64, borderRadius: 22 }}><Icon name="check" /></span>
      <h1 className="sk-title">{batch.importedCount} entr{batch.importedCount === 1 ? "y" : "ies"} added</h1>
      <p className="sk-muted">{fmtMonth(month)} is up to date.{skipped ? ` ${skipped} skipped.` : ""}</p>
      <div className="sk-card sk-card--pad" style={{ width: "100%", textAlign: "left" }}>
        {over ? (
          <div className="sk-tx">
            <span className="sk-tile sk-tile--over"><Icon name={over.icon} /></span>
            <div className="sk-tx__main"><b>{over.name} is now GH₵ {cedis(over.actual - over.planned)} over</b></div>
          </div>
        ) : null}
        <div className="sk-tx">
          <span className="sk-tile sk-tile--needs"><Icon name="wallet" /></span>
          <div className="sk-tx__main"><b>Safe to spend today: GH₵ {cedis(v.safeToday, 2)}</b></div>
        </div>
      </div>
      <div className="sk-stack" style={{ width: "100%" }}>
        {cuts.length ? <Link className="sk-btn sk-btn--block" href="/insights">See cut suggestions</Link> : null}
        <Link className="sk-btn sk-btn--ghost sk-btn--block" href="/home">Back to Home</Link>
      </div>
    </div>
  );
}
