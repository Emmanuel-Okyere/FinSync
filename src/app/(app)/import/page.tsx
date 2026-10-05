import { ActionForm, FieldError, Submit } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/app/PageHead";
import { requireOnboardedUser } from "@/lib/auth/session";
import { uploadStatement } from "../_actions/import";

export const metadata = { title: "Import · FinSync" };

export default async function ImportSource() {
  await requireOnboardedUser();
  return (
    <>
      <PageHead title="Import" back="/settings" add={false} search={false} />
      <div style={{ maxWidth: 640 }} className="sk-stack">
        <div>
          <h2 className="sk-title">Bring in a statement</h2>
          <p className="sk-cap" style={{ marginTop: 6 }}>We read the file, suggest a category for each entry, and you check them before anything is saved.</p>
        </div>
        <ActionForm action={uploadStatement} className="sk-stack">
          <fieldset className="sk-stack" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="sr-only">Statement type</legend>
            {[
              ["momo", "phone", "Mobile money statement", "CSV from your MoMo app or statement email"],
              ["bank", "bank", "Bank statement", "CSV from internet banking"],
            ].map(([v, icon, title, sub], i) => (
              <label key={v} className="sk-scheme" style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <input type="radio" name="source" value={v} defaultChecked={i === 0} />
                <span className="sk-tile"><Icon name={icon} /></span>
                <span className="grow"><b>{title}</b><div className="sk-cap">{sub}</div></span>
                <span className="sk-radio" />
              </label>
            ))}
          </fieldset>
          <div className="sk-card sk-card--flat sk-card--pad sk-stack" style={{ borderStyle: "dashed" }}>
            <label htmlFor="file" className="sk-row" style={{ gap: 12, cursor: "pointer" }}>
              <span className="sk-tile sk-tile--needs"><Icon name="upload" /></span>
              <span><b>Choose a file</b><div className="sk-cap">CSV · up to 4 MB</div></span>
            </label>
            <input id="file" name="file" type="file" accept=".csv,text/csv" required />
            <FieldError name="file" />
          </div>
          <p className="sk-cap sk-row"><Icon name="lock" />PDF or Excel? Open it and save as CSV first. Files are read once and not stored.</p>
          <Submit pendingText="Reading…">Read statement</Submit>
        </ActionForm>
      </div>
    </>
  );
}
