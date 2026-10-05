import Link from "next/link";
import { HeroRings, Wordmark } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sk-auth">
      <div className="sk-auth__art">
        <HeroRings />
        <Link href="/" style={{ position: "relative", textDecoration: "none" }}>
          <Wordmark onHero />
        </Link>
        <div style={{ marginTop: "auto", position: "relative", maxWidth: 460 }}>
          <div style={{ background: "var(--surface)", color: "var(--ink)", borderRadius: "var(--radius-lg)", padding: "18px 20px", boxShadow: "var(--shadow-float)", marginBottom: 36, width: 300 }}>
            <div className="sk-over">Safe to spend today</div>
            <div style={{ margin: "2px 0" }}>
              <span className="sk-num" style={{ fontSize: 30, lineHeight: 1.1 }}>
                <span className="sk-cur">GH₵</span>48.08
              </span>
            </div>
            <div className="sk-stackbar" style={{ height: 8, marginTop: 8 }}>
              <i className="b-needs" style={{ flex: 50 }} />
              <i className="b-wants" style={{ flex: 30 }} />
              <i className="b-savings" style={{ flex: 20 }} />
            </div>
            <div className="sk-cap" style={{ marginTop: 6 }}>
              Example · 50 / 30 / 20
            </div>
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 52, lineHeight: "54px", letterSpacing: "-0.03em", margin: "0 0 14px" }}>Every cedi gets a job.</h1>
          <p style={{ margin: 0, color: "var(--on-hero-muted)", fontSize: 17, lineHeight: "26px" }}>
            Plan the month, log what you spend, and see what is left. Same account on your phone and here.
          </p>
        </div>
      </div>
      <div className="sk-auth__form">
        <div className="sk-auth__inner">{children}</div>
      </div>
    </div>
  );
}
