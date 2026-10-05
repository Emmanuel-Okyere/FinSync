import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Fixed-window rate limit stored in Postgres (no extra infra on Vercel).
 * Atomic: a single upsert increments or resets the window.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.execute<{ count: number; reset_at: string }>(sql`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count    = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at <= now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE rate_limits.reset_at END
    RETURNING count, reset_at
  `);
  const row = rows.rows[0];
  const retryAfter = Math.max(0, Math.ceil((Date.parse(row.reset_at) - Date.now()) / 1000));
  return { ok: row.count <= limit, retryAfter };
}

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super(`Too many attempts. Try again in ${Math.max(1, Math.ceil(retryAfter / 60))} minute(s).`);
  }
}

export async function enforce(key: string, limit: number, windowSeconds: number) {
  const r = await rateLimit(key, limit, windowSeconds);
  if (!r.ok) throw new RateLimitError(r.retryAfter);
}
