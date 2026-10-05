import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/pending";
import { googleEnabled, otpEnabled } from "@/lib/env";
import { fmtMonth, todayISO } from "@/lib/dates";
import { Icon } from "@/components/Icon";
import { SignInForm } from "../forms";

export const metadata = { title: "Sign in · FinSync" };

const ERRORS: Record<string, string> = {
  google: "Google sign-in didn't work. Try again or use your password.",
  google_link: "An account with this email already exists. Sign in with your password.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await getSession()) redirect(safeNext(sp.next));
  return (
    <>
      <Link className="sk-iconbtn hide-desktop" href="/" aria-label="Back">
        <Icon name="back" />
      </Link>
      <div>
        <h1 className="sk-title" style={{ fontSize: 34, lineHeight: "40px" }}>
          Welcome back
        </h1>
        <p className="sk-muted" style={{ marginTop: 6 }}>
          Sign in to see where {fmtMonth(todayISO())} stands.
        </p>
      </div>
      {sp.error && ERRORS[sp.error] ? <div className="sk-alert" role="alert">{ERRORS[sp.error]}</div> : null}
      <SignInForm next={sp.next ? safeNext(sp.next) : undefined} google={googleEnabled()} otp={otpEnabled()} />
      <div style={{ textAlign: "center" }} className="sk-muted">
        New to FinSync? <Link className="sk-link" href="/signup">Create an account</Link>
      </div>
    </>
  );
}
