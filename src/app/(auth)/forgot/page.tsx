import Link from "next/link";
import { otpEnabled } from "@/lib/env";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ForgotForm } from "../forms";

export const metadata = { title: "Forgot password · FinSync" };

export default function Forgot() {
  if (!otpEnabled()) redirect("/signin");
  return (
    <>
      <Link className="sk-iconbtn" href="/signin" aria-label="Back">
        <Icon name="back" />
      </Link>
      <div>
        <h1 className="sk-title" style={{ fontSize: 34, lineHeight: "40px" }}>Forgot your password?</h1>
        <p className="sk-muted" style={{ marginTop: 6 }}>We&apos;ll text you a code so you can set a new one.</p>
      </div>
      <ForgotForm />
    </>
  );
}
