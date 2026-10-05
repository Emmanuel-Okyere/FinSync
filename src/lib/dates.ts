// Dates are handled as YYYY-MM-DD strings in Africa/Accra (UTC+0, no DST).
const TZ = "Africa/Accra";

export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function parseMonthParam(m: string | undefined | null): string {
  if (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return `${m}-01`;
  return monthStart(todayISO());
}

export function addMonths(monthISO: string, n: number) {
  const [y, m] = monthISO.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function daysInMonth(monthISO: string) {
  const [y, m] = monthISO.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthEnd(monthISO: string) {
  return `${monthISO.slice(0, 7)}-${String(daysInMonth(monthISO)).padStart(2, "0")}`;
}

export function dayOf(iso: string) {
  return Number(iso.slice(8, 10));
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts });

export const fmtMonth = (iso: string) => fmt({ month: "long" }).format(new Date(`${iso}T00:00:00Z`));
export const fmtMonthYear = (iso: string) => fmt({ month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
export const fmtShort = (iso: string) => fmt({ day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));
export const fmtLong = (iso: string) => fmt({ day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
export const fmtWeekday = (iso: string) =>
  fmt({ weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T00:00:00Z`));

export function relDay(iso: string, today = todayISO()) {
  const d = diffDays(iso, today);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));
}

/** Next payday on or after `from` for a given rule. */
export function nextPayday(rule: string, day: number | null, from: string): string {
  const pick = (monthISO: string) => {
    if (rule === "25th") return `${monthISO.slice(0, 7)}-25`;
    if (rule === "date" && day) return `${monthISO.slice(0, 7)}-${String(Math.min(day, daysInMonth(monthISO))).padStart(2, "0")}`;
    // last working day (Mon–Fri)
    let d = monthEnd(monthISO);
    for (;;) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (wd !== 0 && wd !== 6) return d;
      d = addDays(d, -1);
    }
  };
  if (rule === "weekly") {
    // Fridays
    let d = from;
    while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 5) d = addDays(d, 1);
    return d;
  }
  const thisMonth = pick(monthStart(from));
  return thisMonth >= from ? thisMonth : pick(addMonths(monthStart(from), 1));
}

export const paydayLabel: Record<string, string> = {
  "25th": "25th",
  last_working_day: "Last working day",
  weekly: "Weekly (Fridays)",
  date: "Set date",
};
