// Payday rules, including weekend shifts. Run: npm run test:dates
import { nextPayday, nextPaydayDetail } from "../src/lib/dates.ts";

let fails = 0;
const eq = (name: string, got: string, want: string) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${got} (want ${want})`);
};

// 25 Oct 2026 is a Sunday.
eq("25th, Friday before", nextPayday("25th", null, "2026-10-05", "before"), "2026-10-23");
eq("25th, Monday after", nextPayday("25th", null, "2026-10-05", "after"), "2026-10-26");
eq("25th, on the day", nextPayday("25th", null, "2026-10-05", "same"), "2026-10-25");
// On the shifted payday itself, payday is today.
eq("25th, today is the Friday before", nextPayday("25th", null, "2026-10-23", "before"), "2026-10-23");
// After the shifted payday, roll to next month (25 Nov 2026 is a Wednesday).
eq("25th, after Friday payday", nextPayday("25th", null, "2026-10-24", "before"), "2026-11-25");
// Saturday payday: 25 Jul 2026 is a Saturday.
eq("Saturday, Friday before", nextPayday("25th", null, "2026-07-01", "before"), "2026-07-24");
eq("Saturday, Monday after", nextPayday("25th", null, "2026-07-01", "after"), "2026-07-27");
// Set date 31st: 31 Oct 2026 is a Saturday; Monday after crosses into November.
eq("31st, Monday after crosses month", nextPayday("date", 31, "2026-10-05", "after"), "2026-11-02");
eq("31st, seen from 1 Nov", nextPayday("date", 31, "2026-11-01", "after"), "2026-11-02");
eq("31st, Friday before", nextPayday("date", 31, "2026-10-05", "before"), "2026-10-30");
// Weekday paydays don't move.
eq("weekday payday unchanged", nextPayday("25th", null, "2026-11-01", "before"), "2026-11-25");
// Last working day is unaffected by the shift (30 Oct 2026 is a Friday).
eq("last working day", nextPayday("last_working_day", null, "2026-10-05", "after"), "2026-10-30");

// The preview reports where a payday was moved from, and nothing when it wasn't moved.
eq("moved from (Friday before)", nextPaydayDetail("25th", null, "2026-10-05", "before").movedFrom ?? "none", "2026-10-25");
eq("moved from (crossing month)", nextPaydayDetail("date", 31, "2026-10-05", "after").movedFrom ?? "none", "2026-10-31");
eq("not moved", nextPaydayDetail("25th", null, "2026-11-01", "before").movedFrom ?? "none", "none");
eq("short month not reported as moved", nextPaydayDetail("date", 31, "2026-11-01", "before").movedFrom ?? "none", "none"); // 30 Nov 2026 is a Monday

console.log(fails ? `${fails} FAILED` : "ALL PASS");
if (fails) process.exit(1);

// ---------------------------------------------------------------- Budget cycles
import { cycleBounds, cycleEndFrom, fmtCycle, occurrencesInRange, prevPayday } from "../src/lib/dates.ts";
{
  let f = 0;
  const same = (name: string, got: unknown, want: unknown) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) f++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(got)} (want ${JSON.stringify(want)})`);
  };
  const p23 = { mode: "payday", rule: "date", day: 23, weekend: "before" } as const;
  // Paid the 23rd (Friday before if weekend). 23 Oct 2026 is a Friday, 23 Nov a Monday.
  same("cycle containing 30 Oct", cycleBounds(p23, "2026-10-30"), { start: "2026-10-23", end: "2026-11-22" });
  same("cycle on payday itself", cycleBounds(p23, "2026-10-23"), { start: "2026-10-23", end: "2026-11-22" });
  same("cycle the day before payday", cycleBounds(p23, "2026-10-22"), { start: "2026-09-23", end: "2026-10-22" });
  // 23 Jan 2027 is a Saturday -> paid Friday 22 Jan; Dec cycle ends 21 Jan.
  same("weekend shift ends cycle early", cycleBounds(p23, "2027-01-05"), { start: "2026-12-23", end: "2027-01-21" });
  // Paid early on 15 Dec for the 23 Dec payday: new cycle runs to the January payday (skips 23 Dec).
  same("early December pay", { start: "2026-12-15", end: cycleEndFrom(p23, "2026-12-15", "2026-12-23") }, { start: "2026-12-15", end: "2027-01-21" });
  // Day before the month ends (31 Oct 2026 is a Saturday -> 30th is 'day before'; 29 Nov is a Sunday -> Friday 27th).
  const dbl = { mode: "payday", rule: "day_before_last", day: null, weekend: "before" } as const;
  same("day-before-last cycle", cycleBounds(dbl, "2026-11-05"), { start: "2026-10-30", end: "2026-11-26" });
  // Last day of month, Friday before if weekend: 31 Oct 2026 Saturday -> 30 Oct.
  const ld = { mode: "payday", rule: "last_day", day: null, weekend: "before" } as const;
  same("last day, weekend shift", prevPayday(ld.rule, null, "2026-11-10", ld.weekend), "2026-10-30");
  // Calendar mode is the month.
  same("calendar cycle", cycleBounds({ mode: "calendar", rule: "date", day: 23, weekend: "before" }, "2026-10-30"), { start: "2026-10-01", end: "2026-10-31" });
  // Labels.
  same("label, payday cycle", fmtCycle("2026-10-23", "2026-11-22"), "23 Oct – 22 Nov");
  same("label, across years", fmtCycle("2026-12-15", "2027-01-21"), "15 Dec 2026 – 21 Jan 2027");
  same("label, calendar month", fmtCycle("2026-10-01", "2026-10-31"), "October");
  // Fixed bills in a long cycle can fall twice.
  same("bill on the 20th in a 38-day cycle", occurrencesInRange(20, "2026-12-15", "2027-01-21"), ["2026-12-20", "2027-01-20"]);
  same("bill on the 31st in a short month", occurrencesInRange(31, "2026-11-23", "2026-12-22"), ["2026-11-30"]);
  if (f) { console.log(`${f} FAILED (cycles)`); process.exit(1); } else console.log("CYCLES PASS");
}

// ---------------------------------------------------------------- Yearly due dates (set-asides)
import { addYears } from "../src/lib/dates.ts";
{
  let f = 0;
  const same = (name: string, got: string, want: string) => {
    if (got !== want) f++;
    console.log(`${got === want ? "PASS" : "FAIL"} ${name}: ${got} (want ${want})`);
  };
  same("next year", addYears("2027-10-01", 1), "2028-10-01");
  same("29 Feb to a non-leap year", addYears("2028-02-29", 1), "2029-02-28");
  same("29 Feb to a leap year", addYears("2028-02-29", 4), "2032-02-29");
  if (f) { console.log(`${f} FAILED (due dates)`); process.exit(1); } else console.log("DUE DATES PASS");
}
