// Applies pending SQL migrations from ./drizzle. Runs automatically before `dev` and `build`
// (so every Vercel deploy migrates Neon before the new code goes live).
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  if (process.env.SKIP_MIGRATIONS === "1") process.exit(0);
  console.error("[migrate] DATABASE_URL is not set. Set it, or SKIP_MIGRATIONS=1 to skip.");
  process.exit(1);
}

const started = Date.now();
if (/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  const { default: pg } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new pg.Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
} else {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle(neon(url)), { migrationsFolder: "./drizzle" });
}
console.log(`[migrate] database is up to date (${Date.now() - started} ms)`);
