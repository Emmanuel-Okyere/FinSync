import { requireUser } from "@/lib/auth/session";
import { Wordmark } from "@/components/Logo";
import { finishLater } from "./actions";
import { StepNav } from "./steps";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div style={{ minHeight: "100dvh" }}>
      <header className="sk-between" style={{ padding: "16px 24px", borderBottom: "1px solid var(--line)", background: "var(--surface)", flexWrap: "wrap" }}>
        <Wordmark />
        <StepNav />
        <form action={finishLater}>
          <button className="sk-link" type="submit">Finish later</button>
        </form>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 64px" }}>{children}</main>
    </div>
  );
}
