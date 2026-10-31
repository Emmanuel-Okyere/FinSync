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

/** Same date n years later (29 Feb becomes 28 Feb). */
export function addYears(iso: string, n: number) {
  const y = Number(iso.slice(0, 4)) + n;
  const md = iso.slice(5);
  if (md === "02-29" && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return `${y}-02-28`;
  return `${y}-${md}`;
}

/** "3 Jan 2027": a date with its year, for due dates. */
export const fmtDue = (iso: string) => fmt({ day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

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

export type WeekendShift = "before" | "after" | "same";

/** Moves a Saturday/Sunday payday to the Friday before or the Monday after. */
export function shiftWeekend(iso: string, shift: WeekendShift) {
  if (shift === "same") return iso;
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (wd === 6) return addDays(iso, shift === "before" ? -1 : 2);
  if (wd === 0) return addDays(iso, shift === "before" ? -2 : 1);
  return iso;
}

/** The scheduled payday in a given calendar month (before/after any weekend shift), or null for weekly pay. */
function rawPayday(rule: string, day: number | null, monthISO: string): { raw: string; shiftable: boolean } | null {
  const ym = monthISO.slice(0, 7);
  const last = daysInMonth(monthISO);
  switch (rule) {
    case "25th":
      return { raw: `${ym}-25`, shiftable: true };
    case "date":
      return day ? { raw: `${ym}-${String(Math.min(day, last)).padStart(2, "0")}`, shiftable: true } : null;
    case "last_day":
      return { raw: `${ym}-${String(last).padStart(2, "0")}`, shiftable: true };
    case "day_before_last":
      return { raw: `${ym}-${String(last - 1).padStart(2, "0")}`, shiftable: true };
    case "weekly":
      return null;
    default: {
      // last working day (Mon–Fri): already a weekday
      let d = monthEnd(monthISO);
      while ([0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, -1);
      return { raw: d, shiftable: false };
    }
  }
}

/** Scheduled paydays (after weekend shifts) in roughly [from − 2 months, from + 3 months], sorted. */
function paydaysAround(rule: string, day: number | null, from: string, weekend: WeekendShift) {
  const out: { date: string; movedFrom: string | null }[] = [];
  if (rule === "weekly") {
    // Fridays
    let d = addDays(from, -70);
    while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 5) d = addDays(d, 1);
    for (; d <= addDays(from, 70); d = addDays(d, 7)) out.push({ date: d, movedFrom: null });
    return out;
  }
  // A shift can cross a month boundary (e.g. the 31st on a Saturday paid on Monday the 2nd), so look around `from`.
  const m = monthStart(from);
  for (let i = -2; i <= 3; i++) {
    const p = rawPayday(rule, day, addMonths(m, i));
    if (!p) continue;
    const date = p.shiftable ? shiftWeekend(p.raw, weekend) : p.raw;
    out.push({ date, movedFrom: date === p.raw ? null : p.raw });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Next payday on or after `from`, plus the date it was moved from (if a weekend shift applied). */
export function nextPaydayDetail(rule: string, day: number | null, from: string, weekend: WeekendShift = "same"): { date: string; movedFrom: string | null } {
  return paydaysAround(rule, day, from, weekend).find((p) => p.date >= from)!;
}

/** Next payday on or after `from` for a given rule. Fixed dates honour the weekend shift. */
export function nextPayday(rule: string, day: number | null, from: string, weekend: WeekendShift = "same"): string {
  return nextPaydayDetail(rule, day, from, weekend).date;
}

/** Most recent payday on or before `on`. */
export function prevPayday(rule: string, day: number | null, on: string, weekend: WeekendShift = "same"): string {
  return paydaysAround(rule, day, on, weekend)
    .filter((p) => p.date <= on)
    .at(-1)!.date;
}

/* ------------------------------------------------------------- Budget cycles */

export type CycleMode = "payday" | "calendar";
export type CycleConfig = { mode: CycleMode; rule: string; day: number | null; weekend: WeekendShift };

/**
 * The scheduled budget cycle containing `date`: payday to the day before the next payday,
 * or the calendar month. Actual cycles can differ when pay arrives early or late ("I've been paid").
 */
export function cycleBounds(cfg: CycleConfig, date: string): { start: string; end: string } {
  if (cfg.mode === "calendar") return { start: monthStart(date), end: monthEnd(date) };
  const start = prevPayday(cfg.rule, cfg.day, date, cfg.weekend);
  const next = nextPayday(cfg.rule, cfg.day, addDays(date, 1), cfg.weekend);
  return { start, end: addDays(next, -1) };
}

/** End of a cycle that starts on `start` (the day before the following scheduled payday). */
export function cycleEndFrom(cfg: CycleConfig, start: string, skipPayday?: string) {
  if (cfg.mode === "calendar") return monthEnd(start);
  // When pay arrives early, the payday it replaces must be skipped (e.g. paid 15 Dec for the 23 Dec payday).
  const from = skipPayday && skipPayday > start ? addDays(skipPayday, 1) : addDays(start, 1);
  return addDays(nextPayday(cfg.rule, cfg.day, from, cfg.weekend), -1);
}

const yearIf = (iso: string, other: string) => (iso.slice(0, 4) !== other.slice(0, 4) || iso.slice(0, 4) !== todayISO().slice(0, 4) ? " " + iso.slice(0, 4) : "");

/** "23 Oct – 22 Nov", "1 – 31 Oct", "15 Dec 2026 – 22 Jan 2027". */
export function fmtCycle(start: string, end: string) {
  if (start.slice(0, 7) === end.slice(0, 7) && start.slice(8) === "01" && end === monthEnd(start)) {
    return `${fmtMonth(start)}${start.slice(0, 4) !== todayISO().slice(0, 4) ? " " + start.slice(0, 4) : ""}`;
  }
  return `${fmtShort(start)}${yearIf(start, end)} – ${fmtShort(end)}${yearIf(end, start)}`;
}

/** Each date in [start, end] that falls on a given day of the month (clamped to short months). */
export function occurrencesInRange(dayOfMonth: number | null, start: string, end: string): string[] {
  if (dayOfMonth == null) return [];
  const out: string[] = [];
  for (let m = monthStart(start); m <= end; m = addMonths(m, 1)) {
    const d = `${m.slice(0, 7)}-${String(Math.min(dayOfMonth, daysInMonth(m))).padStart(2, "0")}`;
    if (d >= start && d <= end) out.push(d);
  }
  return out;
}

/** A date param from the URL (YYYY-MM-DD, or legacy YYYY-MM), else today. */
export function parseDateParam(p: string | undefined | null, legacyMonth?: string | null): string {
  if (p && /^\d{4}-\d{2}-\d{2}$/.test(p) && !Number.isNaN(Date.parse(p))) return p;
  if (legacyMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(legacyMonth)) return `${legacyMonth}-01`;
  return todayISO();
}

export const weekendLabel: Record<WeekendShift, string> = {
  before: "Friday before",
  after: "Monday after",
  same: "On the day",
};

export const paydayLabel: Record<string, string> = {
  "25th": "25th",
  date: "Set date",
  last_working_day: "Last working day",
  last_day: "Last day of the month",
  day_before_last: "Day before the month ends",
  weekly: "Weekly (Fridays)",
};
