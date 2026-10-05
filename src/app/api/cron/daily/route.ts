import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { fixedExpenses, users } from "@/db/schema";
import { getMonthView } from "@/lib/budget";
import { addDays, dayOf, monthStart, todayISO } from "@/lib/dates";
import { cedis } from "@/lib/money";
import { sendSms } from "@/lib/sms/giant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Daily 08:00 Accra: bill reminders, over-budget nudges and safe-to-spend, by SMS (opt-in). */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = todayISO();
  const tomorrowDay = dayOf(addDays(today, 1));
  const recipients = await db
    .select()
    .from(users)
    .where(
      and(
        isNotNull(users.phoneVerifiedAt),
        isNotNull(users.onboardedAt),
        sql`(${users.settings}->>'billReminders' = 'true' OR ${users.settings}->>'dailySafeToSpend' = 'true' OR ${users.settings}->>'overBudgetAlerts' = 'true')`,
      ),
    )
    .limit(2000);

  let sent = 0;
  for (const u of recipients) {
    if (!u.phone) continue;
    try {
      const parts: string[] = [];
      if (u.settings.billReminders) {
        const due = await db
          .select({ name: fixedExpenses.name, amount: fixedExpenses.amountMinor })
          .from(fixedExpenses)
          .where(and(eq(fixedExpenses.userId, u.id), eq(fixedExpenses.active, true), eq(fixedExpenses.dayOfMonth, tomorrowDay)));
        if (due.length) parts.push(`Due tomorrow: ${due.map((d) => `${d.name} GH₵${cedis(d.amount)}`).join(", ")}.`);
      }
      if (u.settings.dailySafeToSpend || u.settings.overBudgetAlerts) {
        const v = await getMonthView(u, monthStart(today));
        if (u.settings.dailySafeToSpend) parts.push(`Safe to spend today: GH₵${cedis(v.safeToday, 2)}.`);
        if (u.settings.overBudgetAlerts) {
          const over = v.lines.filter((l) => l.actual > l.planned && l.bucket !== "savings");
          if (over.length) parts.push(`Over plan: ${over.slice(0, 3).map((l) => `${l.name} +${cedis(l.actual - l.planned)}`).join(", ")}.`);
        }
      }
      if (!parts.length) continue;
      const r = await sendSms(u.phone, `FinSync: ${parts.join(" ")}`.slice(0, 459));
      if (r.ok) sent++;
    } catch (e) {
      console.error("[cron] user alert failed", e instanceof Error ? e.message : e);
    }
  }
  // Housekeeping: expired auth artefacts.
  await db.execute(sql`DELETE FROM otp_codes WHERE expires_at < now() - interval '1 day'`);
  await db.execute(sql`DELETE FROM pending_signups WHERE expires_at < now()`);
  await db.execute(sql`DELETE FROM refresh_tokens WHERE expires_at < now() - interval '7 days'`);
  await db.execute(sql`DELETE FROM rate_limits WHERE reset_at < now() - interval '1 day'`);
  await db.execute(sql`DELETE FROM import_batches WHERE created_at < now() - interval '7 days'`);
  return NextResponse.json({ ok: true, considered: recipients.length, sent });
}
