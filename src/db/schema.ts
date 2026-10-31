import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// Money is always stored in minor units (pesewas) as bigint.
const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export type Bucket = { key: string; name: string; pct: number };
export type Scheme = { id: string; name: string; buckets: Bucket[] };

export type PayslipAllowance = { name?: string; amount: number; per: "month" | "quarter" | "year" };
// `allowances` is the monthly equivalent (kept for older rows); `items` holds each allowance and how often it's paid.
export type PayslipDeduction = { name?: string; type: "pct" | "amount"; value: number };
export type PayslipInput = {
  basic: number;
  allowances: number;
  tier3Pct: number;
  items?: PayslipAllowance[];
  deductions?: PayslipDeduction[]; // recurring, after tax (pct: percent of basic; amount: pesewas)
  taxableBenefits?: number; // monthly non-cash benefits that payroll taxes
};

export type UserSettings = {
  overBudgetAlerts: boolean;
  billReminders: boolean;
  dailySafeToSpend: boolean;
  hideBalances: boolean;
  autoAddFixed: boolean;
  appearance: "system" | "light" | "dark";
  /** Transfer charge rules by payment method (missing = defaults from lib/fees). */
  fees?: Record<string, { pct: number; cap: number }>;
};

export const defaultSettings: UserSettings = {
  overBudgetAlerts: true,
  billReminders: true,
  dailySafeToSpend: false,
  hideBalances: false,
  autoAddFixed: true,
  appearance: "system",
};

/* ---------------------------------------------------------------- Identity */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    phone: text("phone"),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    email: text("email"),
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    // Bumped on password change / "sign out everywhere": invalidates live access tokens at once.
    sessionVersion: integer("session_version").notNull().default(0),
    paydayRule: text("payday_rule").notNull().default("last_working_day"),
    paydayDay: integer("payday_day"),
    // For fixed-date paydays that land on a weekend: before (Friday) | after (Monday) | same.
    paydayWeekend: text("payday_weekend").notNull().default("before"),
    // Budget cycle: "payday" (payday to payday) or "calendar" (1st to month end).
    budgetCycle: text("budget_cycle").notNull().default("calendar"),
    currency: text("currency").notNull().default("GHS"),
    scheme: jsonb("scheme").$type<Scheme>(),
    settings: jsonb("settings").$type<UserSettings>().notNull().default(defaultSettings),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_phone_uq").on(t.phone),
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_google_sub_uq").on(t.googleSub),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    persistent: boolean("persistent").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("refresh_tokens_hash_uq").on(t.tokenHash),
    index("refresh_tokens_family_idx").on(t.familyId),
    index("refresh_tokens_user_idx").on(t.userId),
  ],
);

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    purpose: text("purpose").notNull(), // verify_phone | login | reset_password
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("otp_codes_phone_purpose_idx").on(t.phone, t.purpose)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/* ------------------------------------------------------------------ Budget */

export const incomes = pgTable(
  "incomes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("salary"),
    amountMinor: money("amount_minor").notNull(),
    variable: boolean("variable").notNull().default(false),
    // When take-home was worked out from gross pay (inputs only; net is recomputed server-side).
    payslip: jsonb("payslip").$type<PayslipInput>(),
    createdAt: createdAt(),
  },
  (t) => [index("incomes_user_idx").on(t.userId), check("incomes_amount_pos", sql`${t.amountMinor} >= 0`)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bucket: text("bucket").notNull(),
    icon: text("icon").notNull().default("tag"),
    kind: text("kind").notNull().default("expense"), // expense | income
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_user_name_uq").on(t.userId, t.name)],
);

/**
 * A budget cycle: payday to the day before the next payday, or a calendar month.
 * (Table keeps its original name; `month` holds the cycle's first day.)
 */
export const budgetPeriods = pgTable(
  "budget_months",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    start: date("month").notNull(), // first day of the cycle
    end: date("end_date").notNull(), // last day of the cycle (inclusive)
    paidOn: date("paid_on"), // when the user confirmed pay arrived ("I've been paid")
    scheme: jsonb("scheme").$type<Scheme>().notNull(),
    incomeMinor: money("income_minor").notNull(),
    // Fixed-expense occurrences already auto-logged ("<fixedId>:<date>"). Deleting the entry won't bring it back.
    loggedFixed: jsonb("logged_fixed").$type<string[]>().notNull().default([]),
    // Payday review: leftover kept from the cycle before (adds to this cycle's budget)...
    carriedInMinor: money("carried_in_minor").notNull().default(0),
    // ...and, on the finished cycle, what was kept forward and when its leftover was dealt with.
    carriedOutMinor: money("carried_out_minor").notNull().default(0),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("budget_months_user_month_uq").on(t.userId, t.start),
    index("budget_months_user_end_idx").on(t.userId, t.end),
    check("budget_period_order", sql`${t.end} >= ${t.start}`),
  ],
);

export const fixedExpenses = pgTable(
  "fixed_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amountMinor: money("amount_minor").notNull(),
    dayOfMonth: integer("day_of_month"),
    active: boolean("active").notNull().default(true),
    method: text("method").notNull().default("bank"),
    // Subscriptions and direct debits: no transfer charge.
    noCharge: boolean("no_charge").notNull().default(false),
    // Amount changes each time (electricity, water): planned from recent payments, not auto-logged.
    varies: boolean("varies").notNull().default(false),
    // The account it's paid from (its charge and automatic-savings rules apply).
    accountId: uuid("account_id").references((): AnyPgColumn => accounts.id, { onDelete: "set null" }),
    insurancePolicyId: uuid("insurance_policy_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("fixed_expenses_user_idx").on(t.userId),
    check("fixed_amount_pos", sql`${t.amountMinor} >= 0`),
    check("fixed_day_range", sql`${t.dayOfMonth} IS NULL OR (${t.dayOfMonth} BETWEEN 1 AND 31)`),
  ],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monthId: uuid("month_id").notNull().references(() => budgetPeriods.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    plannedMinor: money("planned_minor").notNull().default(0),
    done: boolean("done").notNull().default(false),
    fixedExpenseId: uuid("fixed_expense_id").references(() => fixedExpenses.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("budget_lines_month_cat_uq").on(t.monthId, t.categoryId),
    index("budget_lines_user_idx").on(t.userId),
    check("lines_planned_pos", sql`${t.plannedMinor} >= 0`),
  ],
);

/* ----------------------------------------------------------- Households */

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  monthlyLimitMinor: money("monthly_limit_minor").notNull().default(0),
  createdAt: createdAt(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), uniqueIndex("household_members_user_uq").on(t.userId)],
);

export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    invitedBy: uuid("invited_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("household_invites_phone_idx").on(t.phone)],
);

export const householdSettlements = pgTable("household_settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  fromUserId: uuid("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toUserId: uuid("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amountMinor: money("amount_minor").notNull(),
  createdAt: createdAt(),
});

/* ---------------------------------------------------------- Transactions */

export const insurancePolicies = pgTable(
  "insurance_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("other"),
    coverText: text("cover_text").notNull().default(""),
    premiumMinor: money("premium_minor").notNull(),
    frequency: text("frequency").notNull().default("monthly"), // monthly | yearly
    renewsOn: date("renews_on"),
    insurer: text("insurer"),
    policyNumber: text("policy_number"),
    details: text("details"),
    excessMinor: money("excess_minor"),
    lastPaidOn: date("last_paid_on"),
    createdAt: createdAt(),
  },
  (t) => [index("insurance_user_idx").on(t.userId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
    kind: text("kind").notNull(), // income | expense
    amountMinor: money("amount_minor").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    note: text("note"),
    method: text("method").notNull().default("momo"),
    occurredOn: date("occurred_on").notNull(),
    source: text("source").notNull().default("manual"), // manual | fixed | import | fee | review | autosave (older: strike | adjust)
    importHash: text("import_hash"),
    // Idempotency key for system-created rows (auto-logged fixed costs, premiums).
    dedupeKey: text("dedupe_key"),
    fixedExpenseId: uuid("fixed_expense_id").references(() => fixedExpenses.id, { onDelete: "set null" }),
    insurancePolicyId: uuid("insurance_policy_id").references(() => insurancePolicies.id, { onDelete: "set null" }),
    // A transfer charge points at the payment it belongs to; deleting the payment deletes the charge.
    feeForId: uuid("fee_for_id").references((): AnyPgColumn => transactions.id, { onDelete: "cascade" }),
    // The user's own account the money moved through (optional; `method` stays the kind of payment).
    accountId: uuid("account_id").references((): AnyPgColumn => accounts.id, { onDelete: "set null" }),
    // Automatic saving: points at the payment that triggered it and the savings place it went to.
    saveForId: uuid("save_for_id").references((): AnyPgColumn => transactions.id, { onDelete: "cascade" }),
    savingsAccountId: uuid("savings_account_id").references((): AnyPgColumn => savingsAccounts.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("transactions_fee_for_idx").on(t.feeForId),
    index("transactions_save_for_idx").on(t.saveForId),
    index("transactions_user_date_idx").on(t.userId, t.occurredOn),
    index("transactions_household_idx").on(t.householdId, t.occurredOn),
    index("transactions_import_hash_idx").on(t.userId, t.importHash),
    uniqueIndex("transactions_dedupe_uq").on(t.userId, t.dedupeKey),
    check("tx_amount_nonzero", sql`${t.amountMinor} > 0`),
    check("tx_kind", sql`${t.kind} IN ('income','expense')`),
  ],
);

/**
 * Money put aside each cycle for a big bill that comes once (or once a year): rent, insurance, school fees.
 * Contributions are expenses in its own category, so each cycle's budget plans and counts them;
 * paying the bill draws on the pot and doesn't count against that cycle a second time.
 */
export const setAsides = pgTable(
  "set_asides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetMinor: money("target_minor").notNull(),
    // Already put aside before using FinSync (not counted against any cycle).
    openingMinor: money("opening_minor").notNull().default(0),
    dueOn: date("due_on").notNull(),
    repeat: text("repeat").notNull().default("yearly"), // yearly | once
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("set_asides_user_idx").on(t.userId), uniqueIndex("set_asides_category_uq").on(t.categoryId), check("set_aside_target_pos", sql`${t.targetMinor} > 0`)],
);

export const setAsidePayouts = pgTable(
  "set_aside_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    setAsideId: uuid("set_aside_id").notNull().references(() => setAsides.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amountMinor: money("amount_minor").notNull(),
    paidOn: date("paid_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("set_aside_payouts_idx").on(t.setAsideId), check("set_aside_payout_pos", sql`${t.amountMinor} > 0`)],
);

/* ------------------------------------------------- Savings, debts, investing */

export const savingsAccounts = pgTable(
  "savings_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("account"), // account | tbill | susu | wallet | other
    balanceMinor: money("balance_minor").notNull().default(0),
    goalMinor: money("goal_minor"),
    maturesOn: date("matures_on"),
    expectedReturnMinor: money("expected_return_minor"),
    // Money you don't touch until the account is closed (e.g. a bank's lifestyle savings).
    locked: boolean("locked").notNull().default(false),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("savings_user_idx").on(t.userId)],
);

/**
 * The user's own accounts, named like buckets ("Stanbic current", "MTN MoMo"). No account numbers:
 * an optional last 4 digits only tells two accounts at one bank apart.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // bank | momo | card | ghanapay | cash | other (the payment method it implies)
    last4: text("last4"),
    // Its own transfer-charge rule; null = the user's rule for its kind.
    fee: jsonb("fee").$type<{ pct: number; cap: number }>(),
    // Automatic saving the bank takes on each payment: amount, where it goes, and categories it skips.
    saveMinor: money("save_minor").notNull().default(0),
    saveToId: uuid("save_to_id").references(() => savingsAccounts.id, { onDelete: "set null" }),
    saveExcept: jsonb("save_except").$type<string[]>().notNull().default([]),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("accounts_user_name_uq").on(t.userId, t.name),
    check("accounts_last4", sql`${t.last4} IS NULL OR ${t.last4} ~ '^[0-9]{4}$'`),
    check("accounts_save_pos", sql`${t.saveMinor} >= 0`),
  ],
);

export const debts = pgTable(
  "debts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    direction: text("direction").notNull().default("owe"), // owe | owed
    name: text("name").notNull(),
    lenderKind: text("lender_kind").notNull().default("bank"),
    principalMinor: money("principal_minor").notNull(),
    balanceMinor: money("balance_minor").notNull(),
    aprBp: integer("apr_bp").notNull().default(0), // annual rate, basis points
    monthlyMinor: money("monthly_minor"),
    nextDueOn: date("next_due_on"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("debts_user_idx").on(t.userId)],
);

export const investments = pgTable(
  "investments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("fund"), // pension | fund | deposit | stocks | other
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [index("investments_user_idx").on(t.userId)],
);

export const investmentEntries = pgTable(
  "investment_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    investmentId: uuid("investment_id").notNull().references(() => investments.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // contribution | valuation
    amountMinor: money("amount_minor").notNull(),
    units: numeric("units", { precision: 18, scale: 4 }),
    occurredOn: date("occurred_on").notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("investment_entries_inv_idx").on(t.investmentId, t.occurredOn)],
);

/* ------------------------------------------------------------------ Import */

export type ImportRow = {
  occurredOn: string;
  name: string;
  amountMinor: number;
  kind: "income" | "expense";
  method: string;
  /** Transfer charge from the statement's fee column, if any. */
  feeMinor?: number;
  /** An automatic-savings debit: index of the payment row it belongs to. */
  saveFor?: number;
  categoryId: string | null;
  hash: string;
  duplicate: boolean;
  include: boolean;
};

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  fileName: text("file_name").notNull(),
  rows: jsonb("rows").$type<ImportRow[]>().notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"), // pending | done
  importedCount: integer("imported_count").notNull().default(0),
  createdAt: createdAt(),
});

/** Sign-ups waiting for SMS verification. A user row is only created once the phone is proven. */
export const pendingSignups = pgTable("pending_signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
