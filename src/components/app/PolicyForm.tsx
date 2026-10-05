import { ActionForm, Field, SelectField, Submit } from "@/components/forms";
import { toInputValue } from "@/lib/money";
import type { insurancePolicies } from "@/db/schema";
import { savePolicy } from "@/app/(app)/_actions/wealth";

export const POLICY_TYPES = [
  { value: "health", label: "Health" },
  { value: "car", label: "Car" },
  { value: "life", label: "Life" },
  { value: "funeral", label: "Funeral" },
  { value: "nhis", label: "NHIS" },
  { value: "home", label: "Home" },
  { value: "other", label: "Other" },
];
export const POLICY_ICON: Record<string, string> = { health: "heart", car: "car", life: "shield", funeral: "users", nhis: "heart", home: "house", other: "umbrella" };

export function PolicyForm({ p }: { p?: typeof insurancePolicies.$inferSelect }) {
  return (
    <ActionForm action={savePolicy} className="sk-stack" reset={!p}>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <Field name="name" label="Name" required defaultValue={p?.name} placeholder="e.g. Car insurance" maxLength={60} />
      <div className="sk-grid g-2" style={{ gap: 10 }}>
        <SelectField name="type" label="Type" options={POLICY_TYPES} defaultValue={p?.type ?? "health"} />
        <Field name="coverText" label="Cover" defaultValue={p?.coverText} placeholder="e.g. Comprehensive" maxLength={120} />
        <Field name="premium" label="Premium (GH₵)" inputMode="decimal" required defaultValue={p ? toInputValue(p.premiumMinor) : ""} />
        <SelectField name="frequency" label="Paid" options={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} defaultValue={p?.frequency ?? "monthly"} />
        <Field name="renewsOn" label="Renews on" type="date" defaultValue={p?.renewsOn ?? ""} />
        <Field name="excess" label="Excess (optional)" inputMode="decimal" defaultValue={toInputValue(p?.excessMinor)} />
      </div>
      <Field name="insurer" label="Insurer (optional)" defaultValue={p?.insurer ?? ""} maxLength={80} />
      <Field name="policyNumber" label="Policy number (optional)" defaultValue={p?.policyNumber ?? ""} maxLength={60} />
      <Field name="details" label="Details (optional)" defaultValue={p?.details ?? ""} placeholder="e.g. vehicle make, model, plate" maxLength={200} />
      <p className="sk-cap">Monthly premiums are added to your budget on the 1st as a fixed expense.</p>
      <Submit>{p ? "Save changes" : "Add policy"}</Submit>
    </ActionForm>
  );
}
