// Transfer charges by payment method. Pure (used in the browser and on the server).
// Defaults reflect published Ghana rates as of October 2026; users can change them in Settings.
//  - MTN MoMo send to a person: 0.75%, max GH₵ 7.50 (yen.com.gh, updated 5 Oct 2026).
//  - MoMoPay / bill payments: no charge to the payer (bills free; merchant pays).
//  - Bank transfers: vary by bank; GH₵ 20 cap per the user, 0.75% via GhIPSS.
//  - GhanaPay: free transfers. Cash: none. E-Levy abolished 2 April 2025 (Act 1128).

export type FeeRule = { pct: number; cap: number }; // pct: percent; cap: pesewas (0 = no cap)
export type FeeRules = Record<string, FeeRule>;

export const PAYMENT_METHODS = [
  { value: "momo", label: "MoMo (send)" },
  { value: "momopay", label: "MoMoPay / bill" },
  { value: "bank", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "ghanapay", label: "GhanaPay" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const;

export const METHOD_VALUES = PAYMENT_METHODS.map((m) => m.value) as [string, ...string[]];

export const METHOD_LABEL: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

export const DEFAULT_FEES: FeeRules = {
  momo: { pct: 0.75, cap: 750 },
  momopay: { pct: 0, cap: 0 },
  bank: { pct: 1, cap: 2000 },
  card: { pct: 0, cap: 0 },
  ghanapay: { pct: 0, cap: 0 },
  cash: { pct: 0, cap: 0 },
  other: { pct: 0, cap: 0 },
};

/** Methods whose charge can be set (cash never carries a transfer charge). */
export const CHARGEABLE_METHODS = ["momo", "momopay", "bank", "card", "ghanapay", "other"];

export function feeRules(saved: Record<string, FeeRule> | undefined | null): FeeRules {
  return { ...DEFAULT_FEES, ...(saved ?? {}) };
}

/** Charge for paying `amount` (pesewas) by `method`. */
export function transferFee(amount: number, method: string, rules: FeeRules): number {
  return method === "cash" ? 0 : feeFor(amount, rules[method]);
}

/** Charge under one rule: pct of the amount, capped (cap 0 = no cap). No rule = no charge. */
export function feeFor(amount: number, r: FeeRule | null | undefined): number {
  if (!r || r.pct <= 0 || amount <= 0) return 0;
  const fee = Math.round((amount * r.pct) / 100);
  return r.cap > 0 ? Math.min(fee, r.cap) : fee;
}

/** Kinds of account a user can add; each implies a payment method. */
export const ACCOUNT_KINDS = [
  { value: "bank", label: "Bank account" },
  { value: "momo", label: "Mobile money" },
  { value: "card", label: "Card" },
  { value: "ghanapay", label: "GhanaPay" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
] as const;
export const ACCOUNT_KIND_VALUES = ACCOUNT_KINDS.map((k) => k.value) as [string, ...string[]];

/** The rule that applies to a payment: the account's own, else the user's rule for its method. Cash never. */
export function ruleFor(method: string, rules: FeeRules, accountFee?: FeeRule | null): FeeRule | null {
  if (method === "cash") return null;
  return accountFee ?? rules[method] ?? null;
}
