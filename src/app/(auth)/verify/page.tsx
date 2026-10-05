import Link from "next/link";
import { otpEnabled } from "@/lib/env";
import { redirect } from "next/navigation";
import { getPending } from "@/lib/auth/pending";
import { maskPhone } from "@/lib/phone";
import { Icon } from "@/components/Icon";
import { VerifyForm } from "../forms";

export const metadata = { title: "Enter your code · FinSync" };

const COPY = {
  verify_phone: ["Confirm your number", "We sent a code to"],
  login: ["Enter your code", "If this number has an account, we sent a code to"],
  reset_password: ["Reset your password", "If this number has an account, we sent a code to"],
} as const;

export default async function Verify() {
  if (!otpEnabled()) redirect("/signin");
  const p = await getPending();
  if (!p) redirect("/signin");
  const [title, lead] = COPY[p.purpose];
  return (
    <>
      <Link className="sk-iconbtn" href={p.purpose === "verify_phone" ? "/signup" : "/signin"} aria-label="Back">
        <Icon name="back" />
      </Link>
      <div>
        <h1 className="sk-title" style={{ fontSize: 34, lineHeight: "40px" }}>{title}</h1>
        <p className="sk-muted" style={{ marginTop: 6 }}>
          {lead} <b>{maskPhone(p.phone)}</b>. It expires in 10 minutes.
        </p>
      </div>
      <VerifyForm />
    </>
  );
}
