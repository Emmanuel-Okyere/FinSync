import type { Bucket, Scheme } from "@/db/schema";

export const PRESET_SCHEMES: (Scheme & { blurb: string; source: string })[] = [
  {
    id: "50-30-20",
    name: "50 / 30 / 20",
    blurb: "Needs · wants · savings. A good place to start.",
    source: "Elizabeth Warren, All Your Worth (2005)",
    buckets: [
      { key: "needs", name: "Needs", pct: 50 },
      { key: "wants", name: "Wants", pct: 30 },
      { key: "savings", name: "Savings", pct: 20 },
    ],
  },
  {
    id: "70-20-10",
    name: "70 / 20 / 10",
    blurb: "Living · savings · debt or giving. For tight months.",
    source: "Common rule of thumb",
    buckets: [
      { key: "needs", name: "Living", pct: 70 },
      { key: "savings", name: "Savings", pct: 20 },
      { key: "giving", name: "Debt or giving", pct: 10 },
    ],
  },
  {
    id: "60-20-20",
    name: "60 / 20 / 20",
    blurb: "For high-rent cities.",
    source: "Variant of 50 / 30 / 20",
    buckets: [
      { key: "needs", name: "Needs", pct: 60 },
      { key: "wants", name: "Wants", pct: 20 },
      { key: "savings", name: "Savings", pct: 20 },
    ],
  },
  {
    id: "80-20",
    name: "80 / 20",
    blurb: "Save 20% first, spend the rest freely.",
    source: "Pay-yourself-first method",
    buckets: [
      { key: "needs", name: "Spend", pct: 80 },
      { key: "savings", name: "Savings", pct: 20 },
    ],
  },
  {
    id: "zero",
    name: "Zero-based",
    blurb: "Give every cedi a line until nothing is left to assign.",
    source: "Zero-based budgeting",
    buckets: [
      { key: "needs", name: "Needs", pct: 50 },
      { key: "wants", name: "Wants", pct: 30 },
      { key: "savings", name: "Savings", pct: 20 },
    ],
  },
];

export const DEFAULT_SCHEME = PRESET_SCHEMES[0];

/** Visual tone per bucket position/key, matching the Sika tokens. */
export function bucketTone(key: string): "needs" | "wants" | "savings" | "over" {
  if (key === "needs") return "needs";
  if (key === "wants") return "wants";
  if (key === "savings") return "savings";
  return "over";
}

export function validateBuckets(buckets: Bucket[]): string | null {
  if (buckets.length < 2 || buckets.length > 5) return "Use two to five buckets.";
  if (!buckets.some((b) => b.key === "savings")) return "Keep a Savings bucket.";
  const total = buckets.reduce((s, b) => s + b.pct, 0);
  if (total !== 100) return `Percentages add up to ${total}%. Make them 100%.`;
  if (buckets.some((b) => !Number.isInteger(b.pct) || b.pct < 0 || b.pct > 100)) return "Use whole percentages.";
  if (new Set(buckets.map((b) => b.key)).size !== buckets.length) return "Bucket names must differ.";
  return null;
}

/** Category buckets are needs/wants/savings/giving; map onto whatever the scheme has. */
export function bucketFor(scheme: Scheme, catBucket: string): string {
  if (scheme.buckets.some((b) => b.key === catBucket)) return catBucket;
  if (catBucket === "savings") return "savings";
  return scheme.buckets.find((b) => b.key !== "savings")?.key ?? "needs";
}

export function schemeLabel(s: Scheme | null | undefined) {
  if (!s) return "No scheme";
  return s.id === "custom" ? s.buckets.map((b) => b.pct).join(" / ") : s.name;
}
