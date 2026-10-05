import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { HeroRings, Wordmark } from "@/components/Logo";

export default async function Welcome() {
  if (await getSession()) redirect("/home");
  return (
    <main style={{ minHeight: "100dvh", background: "var(--hero)", color: "var(--on-hero)", position: "relative", overflow: "hidden", display: "flex", justifyContent: "center" }}>
      <HeroRings />
      <div style={{ width: "100%", maxWidth: 560, minHeight: "100dvh", display: "flex", flexDirection: "column", padding: "44px 24px 36px", position: "relative" }}>
        <Wordmark onHero />
        <div style={{ marginTop: "auto" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 44, lineHeight: "46px", letterSpacing: "-0.03em", margin: "0 0 14px" }}>Every cedi gets a job.</h1>
          <p style={{ margin: "0 0 28px", color: "var(--on-hero-muted)", fontSize: 16, lineHeight: "24px" }}>
            Split your pay the way you want, tick off bills as you pay them, and see what&apos;s left to spend today.
          </p>
          <div className="sk-stack">
            <Link className="sk-btn sk-btn--gold sk-btn--block" href="/signup">Create account</Link>
            <Link className="sk-btn sk-btn--onhero sk-btn--block" href="/signin">I have an account</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
