export type DefaultCategory = { name: string; bucket: string; icon: string; kind?: "expense" | "income" };

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Rent", bucket: "needs", icon: "house" },
  { name: "Electricity", bucket: "needs", icon: "bolt" },
  { name: "Water", bucket: "needs", icon: "drop" },
  { name: "Home internet", bucket: "needs", icon: "wifi" },
  { name: "Groceries", bucket: "needs", icon: "cart" },
  { name: "Transport", bucket: "needs", icon: "bus" },
  { name: "Insurance", bucket: "needs", icon: "shield" },
  { name: "Debt repayment", bucket: "needs", icon: "card" },
  { name: "Health", bucket: "needs", icon: "heart" },
  { name: "Eating out", bucket: "wants", icon: "utensils" },
  { name: "Clothing", bucket: "wants", icon: "shirt" },
  { name: "Data & airtime", bucket: "wants", icon: "phone" },
  { name: "Church giving", bucket: "wants", icon: "gift" },
  { name: "Gym", bucket: "wants", icon: "dumbbell" },
  { name: "Streaming", bucket: "wants", icon: "play" },
  { name: "Outings", bucket: "wants", icon: "ticket" },
  { name: "Emergency fund", bucket: "savings", icon: "wallet" },
  { name: "Investments", bucket: "savings", icon: "trendUp" },
  { name: "Salary", bucket: "income", icon: "briefcase", kind: "income" },
  { name: "Side work", bucket: "income", icon: "laptop", kind: "income" },
  { name: "Other income", bucket: "income", icon: "download", kind: "income" },
];

/** Starter fixed expenses shown on setup step 3 (amounts are suggestions in GH₵). */
export const SUGGESTED_FIXED = [
  { name: "Rent", category: "Rent", amount: 1500, day: 1, on: true },
  { name: "Electricity", category: "Electricity", amount: 250, day: 5, on: true },
  { name: "Home internet", category: "Home internet", amount: 350, day: 10, on: true },
  { name: "Water", category: "Water", amount: 80, day: 15, on: true },
  { name: "Church giving", category: "Church giving", amount: 300, day: null, on: false },
  { name: "Gym", category: "Gym", amount: 200, day: 25, on: false },
  { name: "Streaming", category: "Streaming", amount: 70, day: 1, on: false },
  { name: "Data bundle", category: "Data & airtime", amount: 150, day: 1, on: false },
];

/** How leftover money in each bucket is first spread across variable lines. */
export const STARTER_SPLIT: Record<string, [string, number][]> = {
  needs: [["Groceries", 0.6], ["Transport", 0.4]],
  wants: [["Eating out", 0.4], ["Clothing", 0.3], ["Outings", 0.3]],
  savings: [["Emergency fund", 1]],
};

export const ICON_CHOICES = [
  "house", "bolt", "drop", "wifi", "cart", "bus", "shield", "card", "heart", "utensils", "shirt", "phone",
  "gift", "dumbbell", "play", "ticket", "wallet", "trendUp", "car", "briefcase", "laptop", "tag", "users",
];
