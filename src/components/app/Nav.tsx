"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Icon } from "@/components/Icon";

export const SIDE = [
  ["/home", "Overview", "home"],
  ["/budget", "Budget", "budget"],
  ["/transactions", "Transactions", "transactions"],
  ["/budget/fixed", "Fixed expenses", "repeat"],
  ["/savings", "Savings", "wallet"],
  ["/debts", "Debts", "card"],
  ["/investments", "Investments", "trendUp"],
  ["/insurance", "Insurance", "umbrella"],
  ["/reports", "Reports", "reports"],
  ["/insights", "Insights", "insights"],
  ["/household", "Household", "users"],
  ["/tax", "Tax calculator", "calculator"],
] as const;

function isOn(path: string, href: string) {
  if (href === "/budget") return path === "/budget";
  return path === href || path.startsWith(`${href}/`);
}

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="sk-stack" style={{ gap: 4 }}>
      {SIDE.map(([href, label, icon]) => (
        <Link key={href} href={href} className={`sk-side__item${isOn(path, href) ? " is-on" : ""}`} aria-current={isOn(path, href) ? "page" : undefined}>
          <Icon name={icon} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function TabBar({ addDialog }: { addDialog: React.ReactNode }) {
  const path = usePathname();
  const tab = (href: string, label: string, icon: string, also: string[] = []) => {
    const on = isOn(path, href) || also.some((a) => isOn(path, a));
    return (
      <Link key={href} href={href} className={on ? "is-on" : ""} aria-current={on ? "page" : undefined}>
        <Icon name={icon} />
        {label}
      </Link>
    );
  };
  return (
    <nav className="sk-tabbar" aria-label="Tabs">
      {tab("/home", "Home", "home", ["/transactions", "/settings", "/household"])}
      {tab("/budget", "Budget", "budget", ["/budget/fixed"])}
      <Fragment key="add">{addDialog}</Fragment>
      {tab("/savings", "Savings", "wallet", ["/debts", "/investments", "/insurance"])}
      {tab("/insights", "Insights", "insights", ["/reports"])}
    </nav>
  );
}
