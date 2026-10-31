# FinSync

Personal budgeting for Ghana: split your pay with a scheme (50/30/20 and friends), log spending against your budget lines as it happens, and see what's safe to spend today. Built from the FinSync design canvas (Sika design system).

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

Tier 2 (5% of insurable basic) is paid out of the 18.5% (employee 5.5% + employer 13%), so it is shown for information and never deducted from take-home a second time.

Payslips often carry more: recurring after-tax deductions (a staff saving scheme as a % of basic, loans, dues) and taxable benefits that aren't paid in cash (company car, fuel, housing). Both are supported (`deductions` and `taxableBenefits` in `calculatePay`). `scripts/test-paye.mts` includes a real October 2026 payslip that the engine reproduces to the pesewa.

Allowances can be monthly, quarterly or yearly. PAYE is withheld on what's paid each month, so `yearOfPay()` models a year (quarterly allowances in 4 months, yearly in 1 other month), taxes each month separately, and budgets with the 12-month average. Each allowance's "you keep" figure is its share of the extra PAYE its group adds to the month it's paid in (split by amount), so the per-allowance tax adds up exactly to the total.

## Legal pages

`/terms` and `/privacy` read the operator name and contact email from `LEGAL_OPERATOR_NAME` and `SUPPORT_EMAIL`. Have them reviewed by a lawyer before launch, and register with Ghana's Data Protection Commission as a data controller.

## Paydays

Payday can be the 25th, the last working day, weekly (Fridays) or a set date. For the 25th and set dates, users choose what happens when it lands on a weekend: Friday before (default), Monday after, or on the day. `nextPaydayDetail()` in `src/lib/dates.ts` applies the shift (including across month ends) and drives "payday in N days" and safe-to-spend. Public holidays are not shifted yet. Run `npm test` for the payday and tax checks.

## Feedback: toasts and confirmations

Every action that changes data reports back with a toast (`components/feedback.tsx`); page loads and searches don't. Forms and buttons go through `useServerAction()`, which fires the toast when the action completes, so it still shows when the triggering element disappears (e.g. deleting the row you clicked). Actions that redirect call `flash()` (`src/lib/flash.ts`), a 30-second cookie the next page turns into a toast. Destructive actions use the in-app confirm modal (`useConfirm()` / `ActionButton confirm={…}`), never `window.confirm`.

## Icons

The browser tab icon is the two linked rings (the design notes "favicon drops the arrow"); home-screen and app icons use the full mark. All are generated from the logo by `node scripts/make-icons.mjs` (src/app/icon.svg, favicon.ico, apple-icon.png, public/icons/*); rerun it if the logo or brand green changes.

## Pay cycles

A budget can run from payday to payday (Settings → Income and payday → "Start my budget on payday") or by calendar month (the default for accounts created before cycles existed). Cycles are stored with explicit start and end dates (`budget_months.month` / `end_date`):

- **Scheduled cycle:** from the most recent payday to the day before the next one, using the payday rule (set date, 25th, last working day, last day of the month, day before the month ends, weekly) and the weekend choice. See `cycleBounds()` in `src/lib/dates.ts`.
- **"I've been paid"** (Overview): pay recorded late in a cycle starts the next cycle that day and runs to the payday after the one it replaced (paid 15 Dec for the 23rd → 15 Dec – 21 Jan). Pay recorded early in a cycle (late pay) moves the cycle's start. See `recordPay()` in `src/lib/budget.ts`.
- **Fixed bills** are planned once per time their day falls inside a cycle, and re-planned whenever a cycle's dates change.
- **Pages** take `?p=<any date in the cycle>` (old `?m=YYYY-MM` links still work).

Run `npm test` for the payday and cycle checks.

## Budget lines and income

- **Lines work like categories.** A line's Actual is the total of the expenses logged under it in the cycle; "+" on a line logs spending straight into it. Planned can change any time. Ticking a line ("Mark paid") optionally records a real payment for what's still due; unticking never deletes entries.
- **Regular pay** (non-varying incomes) is what a cycle is planned from, and "I've been paid" records what actually arrived.
- **Income that varies** (side work, commission, irregular allowances) isn't counted in advance. When it's logged as income (any category except Salary), the cycle's bucket targets grow by it, split by the scheme, so safe-to-spend rises immediately.

## Transfer charges

Payments can carry a transfer charge, recorded as its own expense in the **Transfer charges** category and linked to the payment (`transactions.fee_for_id`, deleted with it). Lists show it on the payment's row ("+0.34 charge"); budgets, reports and exports count it.

- **Rules** (Settings → Transfer charges, stored in `users.settings.fees`): a percentage and optional cap per payment method. Defaults in `src/lib/fees.ts` follow Ghana rates as of 2026: MoMo send 0.75% up to GH₵ 7.50; MoMoPay/bills, GhanaPay and card free; bank transfer 1% up to GH₵ 20 (banks vary). E-Levy was abolished in April 2025. Cash is never charged.
- **Entries**: the form works the charge out as you type; it can be unticked or overridden per entry. "Mark paid" on a budget line does the same, starting from the fixed bill's usual method.
- **Fixed bills** have a usual method and a "No transfer charge" switch (subscriptions, direct debits); auto-logged bills add the rule's charge unless switched off.
- **Statement imports** read a Fees / Charges / E-Levy column when present and record it as the linked charge.

`npm run test:fees` checks the rules and the statement fee column.

## Bills that change, set-asides and the payday check-in

- **Bills that change** (Fixed expenses → "Amount changes each month"): planned at the average of the bill's last 3 payments in the past year, rounded up to the cedi (`billSuggestions()` in `src/lib/plans.ts`). A payment is anything logged against the bill, or in its category under its name; "Mark paid" now links the payment to the bill. These bills aren't auto-logged, since the amount isn't known until it's paid.
- **Set-asides** (`/budget/set-asides`, tables `set_asides` and `set_aside_payouts`): yearly rent, insurance, school fees. Each has an amount, a due date, "every year" or "once", and an optional amount already saved. Each cycle gets a "Set aside · …" line for what's still missing, spread over the cycles left before the due date (`setAsidePerCycle()`). Putting money aside is an expense in that line, so it comes out of that cycle's budget. Paying the bill draws on the pot and doesn't count against the cycle again. A yearly set-aside then moves to the same date next year.
- **Payday check-in** (Overview): when a cycle ends with money unspent, the next cycle shows a card to keep it (added to this cycle and split by the scheme, stored as `budget_months.carried_in_minor` / `carried_out_minor`), move it to a savings category (optionally adding it to a savings account's balance), or put it towards a set-aside. It can be split across several choices, or dismissed with "Leave it". Moves are dated on the finished cycle's last day, so they count as that cycle's money.
