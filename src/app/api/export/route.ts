import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listTransactions } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Neutralises spreadsheet formula injection (=, +, -, @, tab, CR at cell start). */
function cell(v: string | number | null | undefined) {
  let s = v == null ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  const rows = await listTransactions(user.id, { from, to, limit: 20_000 });
  const lines = [
    ["Date", "Type", "Name", "Category", "Paid with", "Amount (GHS)", "Note"].join(","),
    ...rows.map((r) =>
      [cell(r.occurredOn), cell(r.kind), cell(r.name), cell(r.catName), cell(r.method), (r.kind === "income" ? 1 : -1) * (r.amountMinor / 100), cell(r.note)].join(","),
    ),
  ];
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finsync-${from}-to-${to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
