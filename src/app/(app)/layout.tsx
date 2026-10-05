import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/session";
import { monthView } from "@/lib/budget";
import { monthStart, todayISO } from "@/lib/dates";
import { entryData } from "@/lib/entry-data";
import { schemeLabel } from "@/lib/schemes";
import { AddEntryButton, AddEntryProvider } from "@/components/app/AddEntry";
import { Wordmark } from "@/components/Logo";
import { SideNav, TabBar } from "@/components/app/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOnboardedUser();
  const today = todayISO();
  const v = await monthView(user, monthStart(today));
  const entry = await entryData(user, v);
  const data = { cats: entry.cats, today, policies: entry.policies, inHousehold: entry.inHousehold };

  return (
    <div className="sk-web">
      <aside className="sk-side">
        <Link href="/home" style={{ padding: "0 8px 20px", textDecoration: "none" }}>
          <Wordmark />
        </Link>
        <SideNav />
        <div style={{ marginTop: "auto", paddingTop: 16 }} className="sk-card sk-card--flat">
          <div className="sk-over">This month</div>
          <div className="sk-h" style={{ margin: "2px 0" }}>{schemeLabel(v.scheme)}</div>
          <div className="sk-cap">
            Day {v.day} of {v.days}
          </div>
          <div style={{ marginTop: 10 }} className="sk-bar sk-bar--wants sk-bar--thin">
            <i style={{ width: `${Math.round((v.day / v.days) * 100)}%` }} />
          </div>
        </div>
        <Link href="/settings" className="sk-row" style={{ padding: "16px 8px 0", textDecoration: "none", color: "inherit" }}>
          <span className="sk-avatar">{user.firstName.slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{user.firstName}</b>
            <div className="sk-cap">Settings</div>
          </div>
        </Link>
      </aside>
      <main className="sk-main" id="main">
        <AddEntryProvider data={data}>{children}</AddEntryProvider>
      </main>
      <AddEntryProvider data={data}>
        <TabBar addDialog={<AddEntryButton fab />} />
      </AddEntryProvider>
    </div>
  );
}
