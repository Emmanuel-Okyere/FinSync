import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = NeonHttpDatabase<typeof schema>;
let _db: DB | undefined;

const isLocal = (url: string) => /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

function getDb(): DB {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (isLocal(url) && process.env.NODE_ENV !== "production") {
    // Local development against a plain Postgres (no Neon HTTP endpoint). Never used in production.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg") as typeof import("pg");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: pgDrizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
    const local = pgDrizzle(new Pool({ connectionString: url, max: 5 }), { schema }) as unknown as DB;
    // Sequential stand-in for Neon's atomic HTTP batch (local dev only).
    local.batch = (async (queries: readonly PromiseLike<unknown>[]) => {
      const out = [];
      for (const q of queries) out.push(await q);
      return out;
    }) as unknown as DB["batch"];
    _db = local;
  } else {
    _db = drizzle(neon(url), { schema });
  }
  return _db;
}

// Lazy proxy so importing this module never needs env at build time.
export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
