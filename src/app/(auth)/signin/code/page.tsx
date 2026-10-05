import Link from "next/link";
import { otpEnabled } from "@/lib/env";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { safeNext } from "@/lib/auth/pending";
import { CodeRequestForm } from "../../forms";

export const metadata = { title: "Sign in with a code · FinSync" };

export default async function CodeSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!otpEnabled()) redirect("/signin");
  const { next } = await searchParams;
  return (
    <>
      <Link className="sk-iconbtn" href="/signin" aria-label="Back">
        <Icon name="back" />
      </Link>
      <div>
        <h1 className="sk-title" style={{ fontSize: 34, lineHeight: "40px" }}>Use a one-time code</h1>
        <p className="sk-muted" style={{ marginTop: 6 }}>We&apos;ll text a 6-digit code to the number on your account.</p>
      </div>
      <CodeRequestForm next={next ? safeNext(next) : undefined} />
    </>
  );
}
