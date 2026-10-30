import Link from "next/link";
import { Icon } from "@/components/Icon";
import { addDays } from "@/lib/dates";
import { AddEntryButton } from "./AddEntry";

/** Steps between budget cycles. `p` is any date inside the target cycle (a day past either end). */
export function PeriodSwitch({ start, end, label, base, extra = "" }: { start: string; end: string; label: string; base: string; extra?: string }) {
  const href = (d: string) => `${base}?p=${d}${extra}`;
  const linkStyle = { height: 34, lineHeight: "34px", padding: "0 8px", display: "grid", placeItems: "center" } as const;
  return (
    <nav className="sk-seg" style={{ padding: 3, flex: "none" }} aria-label="Budget cycle">
      <Link href={href(addDays(start, -1))} style={linkStyle} aria-label="Previous cycle">
        <Icon name="back" />
      </Link>
      <span className="is-on" style={{ height: 34, lineHeight: "34px" }}>{label}</span>
      <Link href={href(addDays(end, 1))} style={linkStyle} aria-label="Next cycle">
        <Icon name="next" />
      </Link>
    </nav>
  );
}

export function PageHead({
  title,
  sub,
  back,
  children,
  add = true,
  search = true,
}: {
  title: string;
  sub?: React.ReactNode;
  back?: string;
  children?: React.ReactNode;
  add?: boolean;
  search?: boolean;
}) {
  return (
    <header className="sk-pagehead">
      <div className="sk-row" style={{ gap: 12, minWidth: 0 }}>
        {back ? (
          <Link className="sk-iconbtn" href={back} aria-label="Back">
            <Icon name="back" />
          </Link>
        ) : null}
        <div style={{ minWidth: 0 }}>
          <h1>{title}</h1>
          {sub ? <div className="sk-cap">{sub}</div> : null}
        </div>
      </div>
      <div className="sk-row sk-wrap" style={{ gap: 12 }}>
        {search ? (
          <form action="/transactions" role="search" className="sk-input sk-input--sm sk-input--line hide-mobile" style={{ width: 240 }}>
            <Icon name="search" />
            <input name="q" placeholder="Search entries" aria-label="Search entries" maxLength={80} />
          </form>
        ) : null}
        {children}
        {add ? <AddEntryButton /> : null}
      </div>
    </header>
  );
}
