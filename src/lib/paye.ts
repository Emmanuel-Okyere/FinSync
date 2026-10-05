// Ghana PAYE + SSNIT for resident employees. Pure functions (used in the browser and on the server).
// All money in pesewas (integer minor units).
//
// Sources (checked 5 Oct 2026):
// - GRA PAYE page, gra.gov.gh/domestic-tax/tax-types/paye: monthly bands for 2026 under the
//   Income Tax (Amendment) Act, 2026 (Act 1178), effective 1 September 2026; SSNIT 5.5% of basic;
//   bonus 5% up to 15% of annual basic; junior-staff overtime 5% / 10%.
// - Previous bands: Income Tax (Amendment) Act, 2023 (Act 1111), in force from 1 January 2024.
// - SSNIT maximum insurable earnings: GH₵ 69,000 a month from 1 January 2026 (GH₵ 61,000 in 2025).
// - Tier 3 relief: voluntary contributions are deductible up to 16.5% of basic salary.

export type Band = { width: number | null; rate: number }; // width null = everything above

export type TaxTable = { id: string; label: string; from: string; bands: Band[] };

export const TAX_TABLES: TaxTable[] = [
  {
    id: "act-1178",
    label: "GRA rates from 1 Sep 2026 (Act 1178)",
    from: "2026-09-01",
    bands: [
      { width: 58800, rate: 0 },
      { width: 8000, rate: 0.05 },
      { width: 10000, rate: 0.1 },
      { width: 290000, rate: 0.175 },
      { width: 1600000, rate: 0.25 },
      { width: 3033200, rate: 0.3 },
      { width: null, rate: 0.35 },
    ],
  },
  {
    id: "act-1111",
    label: "GRA rates from 1 Jan 2024 (Act 1111)",
    from: "2024-01-01",
    bands: [
      { width: 49000, rate: 0 },
      { width: 11000, rate: 0.05 },
      { width: 13000, rate: 0.1 },
      { width: 316667, rate: 0.175 },
      { width: 1600000, rate: 0.25 },
      { width: 3052000, rate: 0.3 },
      { width: null, rate: 0.35 },
    ],
  },
];

export const SSNIT_EMPLOYEE_RATE = 0.055;
export const SSNIT_EMPLOYER_RATE = 0.13;
export const TIER2_RATE = 0.05; // part of the 18.5% total, sent to your Tier 2 fund
export const TIER3_RELIEF_CAP = 0.165;
export const BONUS_RATE = 0.05;
export const BONUS_CAP_OF_ANNUAL_BASIC = 0.15;
export const QJE_ANNUAL_LIMIT = 1_800_000; // qualifying junior employee: GH₵ 18,000 a year
const SSNIT_CEILING: [string, number][] = [
  ["2026-01-01", 6_900_000],
  ["2025-01-01", 6_100_000],
];

export function tableFor(dateISO: string): TaxTable {
  return TAX_TABLES.find((t) => dateISO >= t.from) ?? TAX_TABLES[TAX_TABLES.length - 1];
}

function ssnitCeiling(dateISO: string) {
  return (SSNIT_CEILING.find(([from]) => dateISO >= from) ?? SSNIT_CEILING[SSNIT_CEILING.length - 1])[1];
}

const r = (n: number) => Math.round(n);

export type PayInput = {
  basic: number; // monthly basic salary
  allowances?: number; // taxable cash allowances (transport, rent, etc.)
  bonus?: number; // bonus paid this month
  overtime?: number; // overtime paid this month
  tier3Pct?: number; // your voluntary Tier 3 / provident fund contribution, % of basic
  otherDeductions?: number; // after-tax deductions (loans, dues)
  date?: string; // pay date, picks the tax table
};

export type BandLine = { from: number; to: number | null; rate: number; taxed: number; tax: number };

export type PayResult = {
  table: TaxTable;
  gross: number;
  ssnit: number;
  ssnitBase: number;
  tier2: number;
  tier3: number;
  tier3Relief: number;
  chargeable: number;
  bands: BandLine[];
  incomeTax: number;
  bonusTax: number;
  bonusTaxedAtFlat: number;
  overtimeTax: number;
  overtimeTaxedAtFlat: number;
  juniorEmployee: boolean;
  paye: number;
  otherDeductions: number;
  net: number;
  employerSsnit: number;
};

/** Tax on chargeable income through the graduated bands. */
export function bandTax(chargeable: number, table: TaxTable) {
  let left = Math.max(0, chargeable);
  let start = 0;
  const lines: BandLine[] = [];
  for (const b of table.bands) {
    const taxed = b.width == null ? left : Math.min(left, b.width);
    lines.push({ from: start, to: b.width == null ? null : start + b.width, rate: b.rate, taxed, tax: taxed * b.rate });
    left -= taxed;
    if (b.width != null) start += b.width;
  }
  return { lines: lines.map((l) => ({ ...l, tax: r(l.tax) })), total: r(lines.reduce((s, l) => s + l.tax, 0)) };
}

export function calculatePay(input: PayInput): PayResult {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const table = tableFor(date);
  const basic = Math.max(0, input.basic);
  const allowances = Math.max(0, input.allowances ?? 0);
  const bonus = Math.max(0, input.bonus ?? 0);
  const overtime = Math.max(0, input.overtime ?? 0);
  const tier3Pct = Math.min(100, Math.max(0, input.tier3Pct ?? 0));
  const otherDeductions = Math.max(0, input.otherDeductions ?? 0);

  const ssnitBase = Math.min(basic, ssnitCeiling(date));
  const ssnit = r(ssnitBase * SSNIT_EMPLOYEE_RATE);
  const tier2 = r(ssnitBase * TIER2_RATE);
  const tier3 = r((basic * tier3Pct) / 100);
  const tier3Relief = Math.min(tier3, r(basic * TIER3_RELIEF_CAP));

  // Bonus: up to 15% of annual basic is taxed at a flat 5% (final); the rest joins normal income.
  const bonusCap = r(basic * 12 * BONUS_CAP_OF_ANNUAL_BASIC);
  const bonusTaxedAtFlat = Math.min(bonus, bonusCap);
  const bonusExcess = bonus - bonusTaxedAtFlat;
  const bonusTax = r(bonusTaxedAtFlat * BONUS_RATE);

  // Overtime: concessionary rates only for qualifying junior employees (≤ GH₵ 18,000 a year).
  const juniorEmployee = (basic + allowances) * 12 <= QJE_ANNUAL_LIMIT;
  let overtimeTax = 0;
  let overtimeTaxedAtFlat = 0;
  let overtimeToIncome = overtime;
  if (juniorEmployee && overtime > 0) {
    const half = r(basic * 0.5);
    overtimeTax = r(Math.min(overtime, half) * 0.05 + Math.max(0, overtime - half) * 0.1);
    overtimeTaxedAtFlat = overtime;
    overtimeToIncome = 0;
  }

  const chargeable = Math.max(0, basic + allowances + bonusExcess + overtimeToIncome - ssnit - tier3Relief);
  const { lines, total: incomeTax } = bandTax(chargeable, table);
  const paye = incomeTax + bonusTax + overtimeTax;
  const gross = basic + allowances + bonus + overtime;
  const net = gross - ssnit - tier3 - paye - otherDeductions;

  return {
    table,
    gross,
    ssnit,
    ssnitBase,
    tier2,
    tier3,
    tier3Relief,
    chargeable,
    bands: lines,
    incomeTax,
    bonusTax,
    bonusTaxedAtFlat,
    overtimeTax,
    overtimeTaxedAtFlat,
    juniorEmployee,
    paye,
    otherDeductions,
    net,
    employerSsnit: r(ssnitBase * SSNIT_EMPLOYER_RATE),
  };
}
