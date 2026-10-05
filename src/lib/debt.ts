export type DebtIn = { id: string; balance: number; aprBp: number; monthly: number };

/**
 * Simulates paying all debts with the same total monthly budget, rolling freed-up
 * payments into the next debt. Returns months to debt-free and interest paid.
 */
export function simulatePayoff(debts: DebtIn[], order: "avalanche" | "snowball") {
  const list = debts.filter((d) => d.balance > 0).map((d) => ({ ...d }));
  const budget = list.reduce((s, d) => s + d.monthly, 0);
  if (!list.length) return { months: 0, interest: 0, feasible: true, order: [] as string[] };
  const sorted = [...list].sort((a, b) => (order === "avalanche" ? b.aprBp - a.aprBp || a.balance - b.balance : a.balance - b.balance || b.aprBp - a.aprBp));
  const priority = sorted.map((d) => d.id);
  let interest = 0;
  let months = 0;
  while (list.some((d) => d.balance > 0) && months < 600) {
    months++;
    for (const d of list) {
      if (d.balance <= 0) continue;
      const i = Math.round((d.balance * d.aprBp) / 10000 / 12);
      d.balance += i;
      interest += i;
    }
    let pool = budget;
    for (const d of list) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, d.monthly, pool);
      d.balance -= pay;
      pool -= pay;
    }
    for (const id of priority) {
      const d = list.find((x) => x.id === id)!;
      if (d.balance <= 0 || pool <= 0) continue;
      const pay = Math.min(d.balance, pool);
      d.balance -= pay;
      pool -= pay;
    }
    if (budget <= 0) break;
  }
  return { months, interest, feasible: months < 600 && budget > 0, order: priority };
}
