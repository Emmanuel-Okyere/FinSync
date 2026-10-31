import { PAYMENT_METHODS, feeFor, ruleFor, type FeeRule, type FeeRules } from "@/lib/fees";

/** An account as the entry forms see it (client-safe). */
export type PayAccount = {
  id: string;
  name: string;
  method: string;
  /** Its own charge rule, or null to use the user's rule for its method. */
  fee: FeeRule | null;
  /** Automatic saving the bank takes on payments from it. */
  save: { amount: number; to: string; except: string[] } | null;
};

export type PaidWith = { method: string; account: PayAccount | null };

/** `a:<id>` or `m:<method>` → what it means. */
export function resolvePaidWith(value: string, accounts: PayAccount[]): PaidWith {
  if (value.startsWith("a:")) {
    const account = accounts.find((a) => a.id === value.slice(2)) ?? null;
    if (account) return { method: account.method, account };
  }
  return { method: value.replace(/^[am]:/, "") || "momo", account: null };
}

export function defaultPaidWith(accounts: PayAccount[], init?: { accountId?: string | null; method?: string }) {
  if (init?.accountId && accounts.some((a) => a.id === init.accountId)) return `a:${init.accountId}`;
  if (init?.method) return `m:${init.method}`;
  return accounts.length ? `a:${accounts[0].id}` : "m:momo";
}

export function chargeRule(p: PaidWith, rules: FeeRules) {
  return ruleFor(p.method, rules, p.account?.fee);
}

export const chargeOf = (amount: number, p: PaidWith, rules: FeeRules) => feeFor(amount, chargeRule(p, rules));

export const METHOD_OPTIONS = PAYMENT_METHODS;
