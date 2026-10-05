// All amounts are integer minor units (pesewas). Never use floats for stored money.

export function parseMoney(input: unknown): number | null {
  if (typeof input !== "string" && typeof input !== "number") return null;
  const s = String(input).replace(/[,\s]/g, "").replace(/^GH₵|^GHS|^₵/i, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const fmt0 = new Intl.NumberFormat("en-GH", { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 150000 -> "1,500" */
export function cedis(minor: number, decimals: 0 | 2 = 0) {
  const v = minor / 100;
  return decimals === 2 ? fmt2.format(v) : fmt0.format(Math.round(v));
}

/** 150000 -> "GH₵ 1,500" */
export function ghs(minor: number, decimals: 0 | 2 = 0) {
  const sign = minor < 0 ? "−" : "";
  return `${sign}GH₵ ${cedis(Math.abs(minor), decimals)}`;
}

/** Signed transaction display: −45.00 / +700.00 */
export function signed(minor: number, kind: "income" | "expense") {
  return `${kind === "income" ? "+" : "−"}${cedis(minor, 2)}`;
}

export function toInputValue(minor: number | null | undefined) {
  if (minor == null) return "";
  return (minor / 100).toFixed(2);
}
