import { redirect } from "next/navigation";
import { otpEnabled } from "@/lib/env";
import { getResetGrant } from "@/lib/auth/pending";
import { NewPasswordForm } from "../../forms";

export const metadata = { title: "New password · FinSync" };

export default async function NewPassword() {
  if (!otpEnabled()) redirect("/signin");
  if (!(await getResetGrant())) redirect("/forgot");
  return (
    <>
      <div>
        <h1 className="sk-title" style={{ fontSize: 34, lineHeight: "40px" }}>Set a new password</h1>
        <p className="sk-muted" style={{ marginTop: 6 }}>This signs you out on every other device.</p>
      </div>
      <NewPasswordForm />
    </>
  );
}
