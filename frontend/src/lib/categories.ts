// Mirrors backend/app/categories.py CATEGORIES.
export const CATEGORIES = [
  "Groceries",
  "Dining & Takeout",
  "Coffee & Snacks",
  "Transportation",
  "Gas & Fuel",
  "Shopping",
  "Clothing",
  "Entertainment",
  "Subscriptions",
  "Health & Fitness",
  "Housing & Rent",
  "Utilities",
  "Insurance",
  "Travel",
  "Personal Care",
  "Education",
  "Gifts & Donations",
  "Fees & Charges",
  "Taxes",
  "Income",
  "Transfer",
  "Investments",
  "Uncategorized",
];

// Mirrors backend/app/categories.py TIERS. Keep the two in sync: the backend
// cuts every figure by tier, and this is only for labelling rows client-side.
export type Tier = "fixed" | "essential" | "discretionary" | "excluded";

export const TIERS: Record<string, Tier> = {
  "Housing & Rent": "fixed",
  Utilities: "fixed",
  Insurance: "fixed",
  Subscriptions: "fixed",
  "Health & Fitness": "fixed",
  Groceries: "essential",
  Transportation: "essential",
  "Gas & Fuel": "essential",
  Education: "essential",
  "Dining & Takeout": "discretionary",
  "Coffee & Snacks": "discretionary",
  Shopping: "discretionary",
  Clothing: "discretionary",
  Entertainment: "discretionary",
  Travel: "discretionary",
  "Personal Care": "discretionary",
  "Gifts & Donations": "discretionary",
  Uncategorized: "discretionary",
  Income: "excluded",
  Transfer: "excluded",
  Investments: "excluded",
  Taxes: "excluded",
  "Fees & Charges": "excluded",
};

export function tierFor(category: string): Tier {
  return TIERS[category] ?? "discretionary";
}
