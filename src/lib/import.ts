import "server-only";
import { createHash } from "node:crypto";

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF). Delimiter auto-detected. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") >>> 0);
  const delim = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim()));
      row = [];
      cell = "";
    } else cell += c;
    if (rows.length > 5000) break;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row.map((x) => x.trim()));
  return rows;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t); // Ghana banks: day first
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{2,4})/.exec(t);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

function iso(y: number, mo: number, d: number) {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

function money(s: string): number | null {
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s.trim()) || /^-/.test(s.trim()) || /\bdr\b/i.test(s);
  const n = s.replace(/[^\d.]/g, "");
  if (!n || !/^\d+(\.\d+)?$/.test(n)) return null;
  const v = Math.round(Number(n) * 100);
  return neg ? -v : v;
}

/** First header matching the earliest pattern: patterns are in priority order. */
function find(headers: string[], ...needles: RegExp[]) {
  for (const r of needles) {
    const i = headers.findIndex((h) => r.test(h));
    if (i >= 0) return i;
  }
  return -1;
}

export type ParsedRow = { occurredOn: string; name: string; amountMinor: number; kind: "income" | "expense"; method: string };

/** Maps common Ghana bank / MoMo statement layouts to rows. */
export function extractRows(rows: string[][], source: "momo" | "bank"): { rows: ParsedRow[]; error?: string } {
  const headerIdx = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|credit|withdraw|deposit/i.test(c)));
  if (headerIdx < 0) return { rows: [], error: "We couldn't find Date and Amount columns in that file." };
  const h = rows[headerIdx].map((x) => x.toLowerCase());
  const iDate = find(h, /trans.*date/, /^date/, /value date/, /posting date/, /date/);
  const iDesc = find(h, /narration/, /description/, /details/, /particular/, /remarks/, /to name|recipient|payee|merchant/, /from name/, /reference/, /trans.*type/, /^type/);
  const iDebit = find(h, /^debit$|^debit\b(?!\/)|debit amount|withdrawal|money out|paid out/);
  const iCredit = find(h, /^credit$|^credit\b(?!\/)|credit amount|deposit|money in|paid in/);
  const iAmount = find(h, /^amount/, /trans.*amount/, /amount/);
  const iType = find(h, /dr\/cr|cr\/dr|debit\/credit/, /trans.*type/, /^type/);
  const out: ParsedRow[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDate(r[iDate] ?? "");
    if (!date) continue;
    let amt: number | null = null;
    if (iDebit >= 0 || iCredit >= 0) {
      const d = money(r[iDebit] ?? "");
      const c = money(r[iCredit] ?? "");
      if (d && Math.abs(d) > 0) amt = -Math.abs(d);
      else if (c && Math.abs(c) > 0) amt = Math.abs(c);
    } else if (iAmount >= 0) {
      amt = money(r[iAmount] ?? "");
      const type = (r[iType] ?? "").toLowerCase();
      if (amt != null && amt > 0 && iType >= 0) {
        if (/\b(cr|credit|cash.?in|received|deposit)\b/.test(type)) amt = Math.abs(amt);
        else if (/\b(dr|debit|payment|cash.?out|transfer|purchase|airtime|bill|withdraw)/.test(type)) amt = -Math.abs(amt);
      } else if (amt != null && amt > 0 && iType < 0) {
        amt = -amt; // statements without sign or type: assume money out
      }
    }
    if (!amt) continue;
    const name = (r[iDesc] ?? "").replace(/\s+/g, " ").slice(0, 80) || (amt < 0 ? "Payment" : "Money in");
    out.push({ occurredOn: date, name, amountMinor: Math.abs(amt), kind: amt < 0 ? "expense" : "income", method: source === "momo" ? "momo" : "bank" });
    if (out.length >= 2000) break;
  }
  if (!out.length) return { rows: [], error: "No entries with a date and amount were found." };
  return { rows: out };
}

const RULES: [RegExp, string][] = [
  [/\b(bolt|uber|yango|trotro|taxi|okada|fuel|goil|shell|total ?energies|star ?oil)\b/i, "Transport"],
  [/\b(kfc|pizza|chicken|restaurant|waakye|chop|eatery|burger|papaye|cafe|kitchen|jollof)\b/i, "Eating out"],
  [/\b(melcom|shoprite|max ?mart|makola|market|grocer|supermarket|palace|game)\b/i, "Groceries"],
  [/\b(airtime|bundle|data|mtn|vodafone|telecel|airteltigo)\b/i, "Data & airtime"],
  [/\b(ecg|prepaid|electricity|power)\b/i, "Electricity"],
  [/\b(gwcl|water)\b/i, "Water"],
  [/\b(rent|landlord)\b/i, "Rent"],
  [/\b(netflix|showmax|dstv|gotv|spotify|youtube|apple\.com)\b/i, "Streaming"],
  [/\b(church|tithe|offering|seed)\b/i, "Church giving"],
  [/\b(gym|fitness)\b/i, "Gym"],
  [/\b(pharmacy|hospital|clinic|chemist)\b/i, "Health"],
  [/\b(insurance|nhis|premium)\b/i, "Insurance"],
  [/\b(loan|repayment)\b/i, "Debt repayment"],
  [/\b(salary|payroll|wages)\b/i, "Salary"],
];

export function suggestCategory(name: string, kind: "income" | "expense", byName: Map<string, string>, learned: Map<string, string>) {
  const key = name.toLowerCase();
  if (learned.has(key)) return learned.get(key)!;
  for (const [re, cat] of RULES) if (re.test(name) && byName.has(cat)) {
    if ((cat === "Salary") === (kind === "income")) return byName.get(cat)!;
  }
  if (kind === "income") return byName.get("Other income") ?? null;
  return null;
}

export const rowHash = (r: ParsedRow) =>
  createHash("sha256").update(`${r.occurredOn}|${r.kind}|${r.amountMinor}|${r.name.toLowerCase().replace(/\s+/g, " ")}`).digest("hex").slice(0, 32);
