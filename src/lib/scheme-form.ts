import "server-only";
import type { Scheme } from "@/db/schema";
import { UserError } from "@/lib/action";
import { PRESET_SCHEMES, validateBuckets } from "@/lib/schemes";

export function parseSchemeForm(fd: FormData): Scheme {
  const id = String(fd.get("scheme") ?? "");
  if (id !== "custom") {
    const preset = PRESET_SCHEMES.find((s) => s.id === id);
    if (!preset) throw new UserError("Pick a scheme.");
    return { id: preset.id, name: preset.name, buckets: preset.buckets };
  }
  const names = fd.getAll("bucketName").map((s) => String(s).trim().slice(0, 30));
  const pcts = fd.getAll("bucketPct").map((s) => Number(s));
  const buckets = names.map((name, i) => {
    const lower = name.toLowerCase();
    const key = lower === "savings" ? "savings" : lower === "needs" ? "needs" : lower === "wants" ? "wants" : lower.replace(/[^a-z0-9]+/g, "-").slice(0, 24) || `b${i}`;
    return { key, name: name || `Bucket ${i + 1}`, pct: pcts[i] };
  });
  const problem = validateBuckets(buckets);
  if (problem) throw new UserError(problem);
  return { id: "custom", name: buckets.map((b) => b.pct).join(" / "), buckets };
}

