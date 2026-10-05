import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/session";
import { monthView } from "@/lib/budget";
import { ICON_CHOICES } from "@/lib/categories";
import { addMonths, fmtMonth, parseMonthParam } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { PRESET_SCHEMES, schemeLabel } from "@/lib/schemes";
import { ActionForm, Dialog, Field, SelectField, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { BudgetTable } from "@/components/app/BudgetLines";
import { MonthSwitch, PageHead } from "@/components/app/PageHead";
import { SchemePicker } from "@/components/setup/SchemePicker";
import { Amount, Bar, Empty } from "@/components/app/ui";
import { addLine, applyScheme } from "../_actions/budget";

export const metadata = { title: "Budget · FinSync" };

export default async function Budget({ searchParams }: { searchParams: Promise<{ m?: string; b?: string }> }) {
  const sp = await searchParams;
  const user = await requireOnboardedUser();
  const month = parseMonthParam(sp.m);
  const v = await monthView(user, month);
  const filter = v.scheme.buckets.some((b) => b.key === sp.b) ? sp.b! : "all";
  const lines = filter === "all" ? v.lines : v.lines.filter((l) => l.bucket === filter);
  const sel = filter === "all" ? { planned: v.totalPlanned, actual: v.totalActual, target: v.income } : (() => {
    const b = v.buckets.find((x) => x.key === filter)!;
    return { planned: b.target, actual: b.actual, target: b.target };
  })();
  const bucketNames = Object.fromEntries(v.scheme.buckets.map((b) => [b.key, b.name]));
  const mParam = `m=${month.slice(0, 7)}`;

  return (
    <>
      <PageHead
        title={`${fmtMonth(month)} budget`}
        sub={`${schemeLabel(v.scheme)} · GH₵ ${cedis(v.income)} · ${v.doneCount} of ${v.lines.length} lines struck off`}
      >
        <MonthSwitch month={month} base="/budget" extra={filter !== "all" ? `&b=${filter}` : ""} />
      </PageHead>

      <div className="sk-row sk-wrap" style={{ gap: 10 }}>
        <nav className="sk-seg" style={{ maxWidth: 520, flex: "1 1 340px", minWidth: 0 }} aria-label="Bucket">
          <Link href={`/budget?${mParam}`} className={filter === "all" ? "is-on" : ""}>All</Link>
          {v.scheme.buckets.map((b) => (
            <Link key={b.key} href={`/budget?${mParam}&b=${b.key}`} className={filter === b.key ? "is-on" : ""}>{b.name}</Link>
          ))}
        </nav>
        <Link className="sk-link" href="/budget/fixed">Fixed expenses →</Link>
      </div>

      <div className="sk-grid g-main">
        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad">
            <div className="sk-between">
              <div><div className="sk-over">Planned</div><div className="sk-num" style={{ fontSize: 22 }}>{cedis(sel.planned)}</div></div>
              <div><div className="sk-over">Actual</div><div className="sk-num" style={{ fontSize: 22 }}>{cedis(sel.actual)}</div></div>
              <div><div className="sk-over">Left</div><div className={`sk-num ${sel.planned - sel.actual >= 0 ? "t-income" : "t-expense"}`} style={{ fontSize: 22 }}>{cedis(sel.planned - sel.actual)}</div></div>
            </div>
            <div style={{ marginTop: 12 }}>
              <Bar value={sel.actual} max={sel.planned} tone={filter === "all" ? "needs" : filter} marker={v.isCurrent ? v.day / v.days : undefined} />
            </div>
            {v.scheme.id === "zero" && filter === "all" ? (
              <div className={`sk-cap ${v.unassigned === 0 ? "t-income" : "t-warn"}`} style={{ marginTop: 8 }}>
                {v.unassigned === 0 ? "Every cedi has a line." : v.unassigned > 0 ? `GH₵ ${cedis(v.unassigned)} still to assign` : `Over-assigned by GH₵ ${cedis(-v.unassigned)}`}
              </div>
            ) : null}
          </div>

          <div className="sk-card sk-card--pad">
            <div className="sk-between" style={{ marginBottom: 8 }}>
              <b className="sk-h">Lines</b>
              <Dialog label={<><Icon name="plus" />Add line</>} title="Add a budget line" triggerClassName="sk-btn sk-btn--sm sk-btn--quiet">
                <ActionForm action={addLine} className="sk-stack" reset>
                  <input type="hidden" name="month" value={month} />
                  <Field name="name" label="Name" required maxLength={40} placeholder="e.g. School fees" />
                  <div className="sk-grid g-2" style={{ gap: 10 }}>
                    <SelectField name="bucket" label="Bucket" defaultValue={filter !== "all" ? filter : "needs"} options={[{ value: "needs", label: "Needs" }, { value: "wants", label: "Wants" }, { value: "savings", label: "Savings" }, { value: "giving", label: "Giving / debt" }]} />
                    <SelectField name="icon" label="Icon" options={ICON_CHOICES.map((i) => ({ value: i, label: i }))} defaultValue="tag" />
                  </div>
                  <Field name="planned" label="Planned (GH₵)" inputMode="decimal" required placeholder="0.00" />
                  <Submit>Add line</Submit>
                </ActionForm>
              </Dialog>
            </div>
            {lines.length ? <BudgetTable lines={lines} bucketNames={bucketNames} /> : <Empty title="No lines here yet">Add a line to start planning.</Empty>}
            <p className="sk-cap" style={{ marginTop: 12 }}>
              Tick the box to strike a line off. Actual fills in with the planned amount; change it if you paid more or less.
            </p>
          </div>
        </div>

        <div className="sk-stack" style={{ gap: 16 }}>
          <div className="sk-card sk-card--pad sk-stack">
            <b className="sk-h">Buckets</b>
            {v.buckets.map((b) => (
              <div key={b.key} className="sk-stack" style={{ gap: 6 }}>
                <div className="sk-between">
                  <span className="sk-row"><i className={`sk-dot b-${b.key === "needs" ? "needs" : b.key === "wants" ? "wants" : b.key === "savings" ? "savings" : "over"}`} />{b.name} · {b.pct}%</span>
                  <span><b>{cedis(b.actual)}</b> <span className="sk-cap">/ {cedis(b.target)}</span></span>
                </div>
                <Bar value={b.actual} max={b.target} tone={b.key} marker={v.isCurrent ? v.day / v.days : undefined} thin />
                {b.planned !== b.target ? (
                  <span className="sk-cap">Lines plan GH₵ {cedis(b.planned)} of {cedis(b.target)}</span>
                ) : null}
              </div>
            ))}
            <div className="sk-between sk-cap">
              <span>Left to spend or save</span>
              <Amount minor={v.income - v.totalActual} style={{ fontSize: 18 }} />
            </div>
          </div>
        </div>
      </div>

      <section id="scheme" className="sk-stack" style={{ gap: 12 }}>
        <div>
          <h2 className="sk-h" style={{ fontSize: 22 }}>Split for {fmtMonth(month)}</h2>
          <p className="sk-cap">Changing the split keeps your lines; bucket targets update.</p>
        </div>
        <SchemePicker
          action={applyScheme}
          presets={PRESET_SCHEMES}
          current={v.scheme}
          income={v.income}
          showSources
          extra={
            <>
              <input type="hidden" name="month" value={month} />
              <fieldset className="sk-seg" style={{ border: 0, margin: 0 }}>
                <legend className="sr-only">Apply to</legend>
                <label><input type="radio" name="apply" value="this" defaultChecked />Apply to {fmtMonth(month)}</label>
                <label><input type="radio" name="apply" value="next" />Use for {fmtMonth(addMonths(month, 1))}</label>
              </fieldset>
            </>
          }
          submit={<Submit>Save split</Submit>}
        />
      </section>
    </>
  );
}
