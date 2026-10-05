import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { googleEnabled } from "@/lib/env";
import { Icon } from "@/components/Icon";
import { SignUpForm } from "../forms";

export const metadata = { title: "Create account · FinSync" };

export default async function SignUp() {
  if (await getSession()) redirect("/home");
  return (
    <>
      <Link className="sk-iconbtn hide-desktop" href="/" aria-label="Back">
        <Icon name="back" />
      </Link>
      <div>
        <h1 className="sk-title" style={{ fontSize: 34, lineHeight: "40px" }}>Create your account</h1>
        <p className="sk-muted" style={{ marginTop: 6 }}>Free. Takes about two minutes.</p>
      </div>
      <SignUpForm google={googleEnabled()} />
      <div style={{ textAlign: "center" }} className="sk-muted">
        Already have an account? <Link className="sk-link" href="/signin">Sign in</Link>
      </div>
    </>
  );
}
