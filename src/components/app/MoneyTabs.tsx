import Link from "next/link";

const TABS = [
  ["/savings", "Savings"],
  ["/investments", "Investments"],
  ["/insurance", "Insurance"],
  ["/debts", "Debts"],
] as const;

export function MoneyTabs({ on }: { on: string }) {
  return (
    <nav className="sk-chips hide-desktop" aria-label="Money">
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} className={`sk-chip${on === href ? " is-on" : ""}`} aria-current={on === href ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
