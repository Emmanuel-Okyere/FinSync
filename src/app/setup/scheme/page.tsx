import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { incomeTotal } from "@/lib/budget";
import { PRESET_SCHEMES } from "@/lib/schemes";
import { SchemePicker, Submit } from "@/components/setup/SchemePicker";
import { saveScheme } from "../actions";
import { StepHead } from "../steps";

export const metadata = { title: "Setup: scheme · FinSync" };

export default async function SetupScheme() {
  const user = await requireUser();
  const income = await incomeTotal(user.id);
  return (
    <>
      <StepHead n={2} title="How should we split your pay?" lead="Pick a scheme. The split in cedis updates as you choose." />
      <SchemePicker
        action={saveScheme}
        presets={PRESET_SCHEMES}
        current={user.scheme}
        income={income}
        submit={
          <div className="sk-grid g-2" style={{ gap: 10 }}>
            <Link className="sk-btn sk-btn--ghost" href="/setup/income">Back</Link>
            <Submit className="sk-btn">Continue</Submit>
          </div>
        }
      />
    </>
  );
}
