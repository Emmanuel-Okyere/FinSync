import "server-only";
import { unstable_rethrow } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { RateLimitError } from "@/lib/rate-limit";

export type FormState = { ok?: string; error?: string; fields?: Record<string, string>; at?: number };

/** An error whose message is safe to show the user. */
export class UserError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

/**
 * Wraps a server action body: validates nothing by itself, but turns known errors into
 * friendly form state and hides everything else (no stack traces or SQL reach the browser).
 */
export async function run(fn: () => Promise<string | void>, opts: { refresh?: boolean } = { refresh: true }): Promise<FormState> {
  try {
    const ok = (await fn()) ?? "Saved";
    if (opts.refresh !== false) refresh();
    return { ok, at: Date.now() };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof UserError) return { error: e.message, fields: e.field ? { [e.field]: e.message } : undefined, at: Date.now() };
    if (e instanceof RateLimitError) return { error: e.message, at: Date.now() };
    if (e instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const i of e.issues) fields[String(i.path[0] ?? "form")] ??= i.message;
      return { error: Object.values(fields)[0] ?? "Check the form.", fields, at: Date.now() };
    }
    if (e instanceof Error && e.message.startsWith("Your session has ended")) return { error: e.message, at: Date.now() };
    console.error("[action]", e);
    // Details only in development; production never exposes internal errors.
    const detail = process.env.NODE_ENV !== "production" && e instanceof Error ? ` (${e.message})` : "";
    return { error: `Something went wrong. Please try again.${detail}`, at: Date.now() };
  }
}

/** FormData -> plain object of strings (checkbox "on" kept as-is). */
export function formObject(fd: FormData) {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) o[k] = v;
  return o;
}

// Shared field validators
export const zMoney = (label = "Amount") =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      const clean = s.replace(/[,\s]/g, "");
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(clean)) {
        ctx.addIssue({ code: "custom", message: `${label}: enter a number like 150 or 150.50` });
        return z.NEVER;
      }
      const [w, f = ""] = clean.split(".");
      return Number(w) * 100 + Number(f.padEnd(2, "0"));
    });
export const zMoneyOpt = (label?: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((s) => (s ? s : undefined))
    .pipe(zMoney(label).optional());
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date").refine((s) => !Number.isNaN(Date.parse(s)), "Pick a valid date");
export const zDateOpt = z
  .string()
  .optional()
  .transform((s) => (s ? s : undefined))
  .pipe(zDate.optional());
export const zText = (max = 120, label = "This field") => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);
export const zTextOpt = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => (s ? s : null));
export const zUuid = z.string().uuid("Invalid item");
export const zBool = z
  .string()
  .optional()
  .transform((s) => s === "on" || s === "true" || s === "1");
