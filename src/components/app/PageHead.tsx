import Link from "next/link";
import { Icon } from "@/components/Icon";
import { addMonths, fmtMonthYear } from "@/lib/dates";
import { AddEntryButton } from "./AddEntry";

export function MonthSwitch({ month, base, extra = "" }: { month: string; base: string; extra?: string }) {
  const href = (m: string) => `${base}?m=${m.slice(0, 7)}${extra}`;
  return (
    <nav className="sk-seg" style={{ padding: 3, flex: "none" }} aria-label="Month">
      <Link href={href(addMonths(month, -1))} style={{ height: 34, lineHeight: "34px", padding: "0 8px", display: "grid", placeItems: "center" }} aria-label="Previous month">
        <Icon name="back" />
      </Link>
      <span className="is-on" style={{ height: 34, lineHeight: "34px" }}>{fmtMonthYear(month)}</span>
      <Link href={href(addMonths(month, 1))} style={{ height: 34, lineHeight: "34px", padding: "0 8px", display: "grid", placeItems: "center" }} aria-label="Next month">
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
