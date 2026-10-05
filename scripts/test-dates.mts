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
