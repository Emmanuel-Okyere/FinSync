# FinSync

Personal budgeting for Ghana: split your pay with a scheme (50/30/20 and friends), strike off bills as you pay them, and see what's safe to spend today. Built from the FinSync design canvas (Sika design system).

**Stack:** Next.js 16 (App Router, Server Actions, `proxy.ts`), Neon Postgres + Drizzle ORM, JWT auth with rotating refresh tokens, GIANT SMS (sender ID `AwoshieSDA`).

## Run locally

```bash
cp .env.example .env.local   # fill in DATABASE_URL, JWT_SECRET, OTP_SECRET
npm install
npm run dev                  # applies pending migrations, then starts Next
```

Without GIANT SMS credentials in development, one-time codes are printed to the server console (`[sms:dev] …`). In production a missing SMS config is an error.

A `postgresql://…@localhost/…` URL uses a plain Postgres driver for local work; every other URL (and production) uses Neon's serverless driver.

## Database migrations (automatic)

- Schema lives in `src/db/schema.ts`. After changing it: `npm run db:generate` and commit the new file in `drizzle/`.
- `npm run dev` and `npm run build` run `scripts/migrate.mjs` first, so **every Vercel deploy migrates Neon before the new build goes live**. If a migration fails, the deploy fails and the old version keeps serving.
- Set `DATABASE_URL_UNPOOLED` (Neon's direct connection) for migrations; the app uses the pooled `DATABASE_URL`.

## Deploying to Vercel

1. Import the repo; framework preset Next.js (build command stays `npm run build`).
2. Add the env vars from `.env.example` (Neon's Vercel integration can add `DATABASE_URL` / `DATABASE_URL_UNPOOLED`).
3. Set `APP_URL` to the production URL, and `CRON_SECRET` (Vercel Cron sends it as a Bearer token to `/api/cron/daily`, scheduled in `vercel.json` for 08:00 Accra).
4. Optional Google sign-in: create an OAuth client with redirect URI `${APP_URL}/api/auth/google/callback`.

## Auth and security design

| Concern | How it's handled |
| --- | --- |
| Passwords | Argon2id (OWASP params), min 10 chars, blocks common passwords and the user's own name/number. Dummy hash on unknown users to flatten timing. |
| Access token | HS256 JWT, 15 min, pinned algorithm, `iss`/`aud` checked, carries a session version and token-family id. HttpOnly, `SameSite=Lax`, `Secure` + `__Host-` prefix in production. |
| Refresh token | 256-bit random, stored only as SHA-256, single use, rotated on every refresh by `src/proxy.ts`. Reuse of a rotated token (outside a 20 s race window for parallel requests) revokes the whole family. 30 days with "Keep me signed in", otherwise a browser-session cookie with a 12 h server-side limit. |
| Logout / password change | Logout revokes the token family. Password change, reset and "sign out on all devices" bump the user's session version, which kills every live access token at once. |
| Sign-up | With `OTP_ENABLED=false` (current default) the account is created and signed in immediately; the phone number is stored but **not verified**, so SMS alerts and household invites stay off for that user. With `OTP_ENABLED=true` the account is only created after the number is proven by SMS code, and "Code by SMS" sign-in and password reset appear. |
| One-time codes (when enabled) | 6 digits, HMAC-hashed, 10 min expiry, 5 attempts, single use, resend cooldown; SMS only to allowed country prefixes (blocks SMS-pumping). |
| Brute force | Postgres-backed rate limits on sign-in (per IP and per account), sign-up, codes, resets, imports and invites. |
| Enumeration | Code sign-in and password reset answer the same way whether or not the number has an account. |
| Authorization | Every query and mutation is scoped to the signed-in user inside the server action itself (not just in `proxy.ts`). Route IDs are validated UUIDs. |
| CSRF | Server Actions' origin check + `SameSite=Lax` cookies; no state-changing GET routes. |
| Headers | Nonce-based CSP with `strict-dynamic`, `frame-ancestors 'none'`, HSTS (prod), `nosniff`, strict referrer and permissions policies. |
| Open redirects | `next` parameters must be same-site relative paths. |
| Imports/exports | CSV only, 4 MB cap, parsed in memory and not stored as files; exported cells starting with `= + - @` are neutralised. |
| Google sign-in | PKCE + state + nonce, ID token verified against Google's JWKS, verified email required, never auto-links to an existing account by email. |
| Errors | Server actions return friendly messages; internal errors and SQL never reach the browser. |

## Tax and SSNIT calculator

`src/lib/paye.ts` holds the rules as data: GRA monthly PAYE bands (Act 1178 from 1 Sep 2026; Act 1111 before that), SSNIT 5.5% of basic capped at the 2026 maximum insurable earnings (GH₵ 69,000), Tier 3 relief up to 16.5% of basic, bonus at 5% up to 15% of annual basic, and junior-staff overtime rates. The table is picked by pay date, so add a new entry to `TAX_TABLES` when GRA changes rates, then run:

```bash
npm run test:paye
```

The server always recomputes take-home from the gross inputs; it never trusts a figure sent by the browser.

Allowances can be monthly, quarterly or yearly. PAYE is withheld on what's paid each month, so `yearOfPay()` models a year (quarterly allowances in 4 months, yearly in 1 other month), taxes each month separately, and budgets with the 12-month average. Each allowance's "you keep" figure is its share of the extra PAYE its group adds to the month it's paid in (split by amount), so the per-allowance tax adds up exactly to the total.

## Legal pages

`/terms` and `/privacy` read the operator name and contact email from `LEGAL_OPERATOR_NAME` and `SUPPORT_EMAIL`. Have them reviewed by a lawyer before launch, and register with Ghana's Data Protection Commission as a data controller.

## Paydays

Payday can be the 25th, the last working day, weekly (Fridays) or a set date. For the 25th and set dates, users choose what happens when it lands on a weekend: Friday before (default), Monday after, or on the day. `nextPaydayDetail()` in `src/lib/dates.ts` applies the shift (including across month ends) and drives "payday in N days" and safe-to-spend. Public holidays are not shifted yet. Run `npm test` for the payday and tax checks.
