"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, Field, FieldError, Submit, useFormState } from "@/components/forms";
import { GoogleIcon, Icon } from "@/components/Icon";
import { requestLoginCode, requestReset, resendCode, setNewPassword, signIn, signUp, verifyCode } from "./actions";

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return pw.length < 10 ? Math.min(s, 1) : Math.max(s, 2);
}
const LABEL = ["Too short", "Weak password", "Okay password", "Good password", "Strong password"];

function PasswordField({ meter = false, autoComplete }: { meter?: boolean; autoComplete: string }) {
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const st = useFormState();
  const s = strength(pw);
  return (
    <div className="sk-field">
      <label htmlFor="f-password">Password</label>
      <div className="sk-input">
        <Icon name="lock" />
        <input
          id="f-password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={meter ? 10 : undefined}
          maxLength={128}
          onChange={(e) => setPw(e.target.value)}
          aria-invalid={st.fields?.password ? true : undefined}
        />
        <button type="button" className="sk-link" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
          <Icon name="eye" />
        </button>
      </div>
      {meter && pw ? (
        <>
          <div className="sk-row" style={{ gap: 4 }} aria-hidden>
            {[1, 2, 3, 4].map((i) => (
              <i key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= s ? (s >= 3 ? "var(--income)" : "var(--warn)") : "var(--line)" }} />
            ))}
          </div>
          <span className={`sk-cap ${s >= 3 ? "t-income" : "t-warn"}`}>{LABEL[s]}</span>
        </>
      ) : null}
      {meter && !pw ? <span className="sk-cap">At least 10 characters.</span> : null}
      <FieldError name="password" />
    </div>
  );
}

export function SignUpForm({ google }: { google: boolean }) {
  return (
    <ActionForm action={signUp} className="sk-stack" style={{ gap: 16 }}>
      <div className="sk-grid g-2" style={{ gap: 12 }}>
        <Field name="firstName" label="First name" autoComplete="given-name" required maxLength={60} />
        <Field name="lastName" label="Last name" autoComplete="family-name" maxLength={60} />
      </div>
      <Field name="phone" label="Phone number" type="tel" icon="phone" autoComplete="tel" inputMode="tel" placeholder="024 555 0192" required  />
      <PasswordField meter autoComplete="new-password" />
      <label className="sk-row sk-cap" style={{ alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" name="terms" required style={{ width: 20, height: 20, accentColor: "var(--brand)", margin: 0, flex: "none" }} />
        <span>
          I agree to the <Link className="sk-link" href="/terms">terms</Link> and <Link className="sk-link" href="/privacy">privacy policy</Link>
        </span>
      </label>
      <FieldError name="terms" />
      <Submit className="sk-btn sk-btn--gold sk-btn--block" pendingText="Creating…">Create account</Submit>
      {google ? (
        <a className="sk-btn sk-btn--ghost sk-btn--block" href="/api/auth/google">
          <GoogleIcon />
          Sign up with Google
        </a>
      ) : null}
    </ActionForm>
  );
}

export function SignInForm({ next, google, otp }: { next?: string; google: boolean; otp: boolean }) {
  return (
    <ActionForm action={signIn} className="sk-stack" style={{ gap: 16 }}>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field name="identifier" label="Phone or email" icon="mail" autoComplete="username" required />
      <div className="sk-stack" style={{ gap: 6 }}>
        <PasswordField autoComplete="current-password" />
        <div className="sk-between">
          <label className="sk-row" style={{ gap: 10, cursor: "pointer" }}>
            <input type="checkbox" name="remember" defaultChecked style={{ width: 20, height: 20, accentColor: "var(--brand)", margin: 0 }} />
            <span className="sk-cap" style={{ color: "var(--ink)" }}>Keep me signed in</span>
          </label>
          {otp ? (
            <Link className="sk-link" style={{ fontSize: 14 }} href="/forgot">
              Forgot password?
            </Link>
          ) : null}
        </div>
      </div>
      <Submit pendingText="Signing in…">Sign in</Submit>
      {google || otp ? (
        <>
      <div className="sk-row sk-cap" style={{ gap: 12 }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        or
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
      <div className={google && otp ? "sk-grid g-2" : "sk-stack"} style={{ gap: 10 }}>
        {google ? (
          <a className="sk-btn sk-btn--ghost" href="/api/auth/google">
            <GoogleIcon />
            Google
          </a>
        ) : null}
        {otp ? (
          <Link className="sk-btn sk-btn--ghost" href={`/signin/code${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
            <Icon name="message" />
            Code by SMS
          </Link>
        ) : null}
      </div>
        </>
      ) : null}
    </ActionForm>
  );
}

export function CodeRequestForm({ next }: { next?: string }) {
  return (
    <ActionForm action={requestLoginCode} className="sk-stack" style={{ gap: 16 }}>
      <input type="hidden" name="next" value={next ?? ""} />
      <Field name="phone" label="Phone number" type="tel" icon="phone" autoComplete="tel" inputMode="tel" placeholder="024 555 0192" required />
      <Submit pendingText="Sending…">Text me a code</Submit>
    </ActionForm>
  );
}

export function ForgotForm() {
  return (
    <ActionForm action={requestReset} className="sk-stack" style={{ gap: 16 }}>
      <Field name="phone" label="Phone number on your account" type="tel" icon="phone" autoComplete="tel" inputMode="tel" placeholder="024 555 0192" required />
      <Submit pendingText="Sending…">Text me a reset code</Submit>
    </ActionForm>
  );
}

export function VerifyForm() {
  return (
    <div className="sk-stack" style={{ gap: 16 }}>
      <ActionForm action={verifyCode} className="sk-stack" style={{ gap: 16 }}>
        <Field name="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder="••••••" />
        <Submit pendingText="Checking…">Continue</Submit>
      </ActionForm>
      <ActionForm action={resendCode} showOk>
        <Submit className="sk-btn sk-btn--ghost sk-btn--block" pendingText="Sending…">
          Send a new code
        </Submit>
      </ActionForm>
    </div>
  );
}

export function NewPasswordForm() {
  return (
    <ActionForm action={setNewPassword} className="sk-stack" style={{ gap: 16 }}>
      <PasswordField meter autoComplete="new-password" />
      <Submit pendingText="Saving…">Save and sign in</Submit>
    </ActionForm>
  );
}
