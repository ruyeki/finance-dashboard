export type AccountType =
  | "checking"
  | "savings"
  | "brokerage"
  | "roth"
  | "_401k"
  | "credit"
  | "other";

export interface Account {
  id: number;
  name: string;
  institution: string;
  type: AccountType;
  subtype: string | null;
  current_balance: number;
  available_balance: number | null;
  currency: string;
  is_manual: boolean;
}

export interface Transaction {
  id: number;
  account_id: number;
  date: string;
  amount: number;
  merchant_name: string | null;
  raw_name: string;
  category: string;
  category_source: string;
  pending: boolean;
  is_income: boolean;
  is_transfer: boolean;
  notes: string | null;
}

export interface CategorySpend {
  category: string;
  amount: number;
}

export interface MerchantSpend {
  merchant: string;
  amount: number;
  count: number;
}

export interface SourceSpend {
  source: string;
  amount: number;
  count: number;
}

export interface SpendingSummary {
  period_start: string;
  period_end: string;
  cadence: string;
  total: number;
  previous_total: number;
  delta: number;
  average: number;
  by_category: CategorySpend[];
  income: number;
  days_elapsed: number;
  days_total: number;
  daily_avg: number;
  projected: number;
  savings_rate: number | null;
  net_cash_flow: number;
  top_category: string | null;
  top_merchants: MerchantSpend[];
  by_source: SourceSpend[];
  // Added by the redesign. Every figure below is cut by tier.
  by_tier: TierTotals;
  /** Per-category average over 6 complete prior periods, truncated to the same
   *  day of the period so a mid-period comparison is like-for-like. */
  category_averages: Record<string, number>;
  tier_averages: TierTotals;
  discretionary_budget: number;
  discretionary_spent: number;
  discretionary_left: number;
  /** (401k + cash kept) / gross. Displayed as "savings rate". */
  keep_rate: number | null;
  gross: number;
  take_home: number;
}

export type Tier = "fixed" | "essential" | "discretionary" | "excluded";

export type TierTotals = Record<Tier, number>;

export interface FlowNode {
  key: string;
  label: string;
  value: number;
  avg?: number;
  detail?: { tax: number; insurance: number };
  children?: { name: string; value: number; avg: number }[];
}

/** Two-split money flow. `split2` sums to take-home to the cent; `split1` to gross. */
export interface FlowData {
  period_start: string;
  period_end: string;
  days_elapsed: number;
  days_total: number;
  gross: number;
  split1: FlowNode[];
  split2: FlowNode[];
}

export interface RecurringItem {
  merchant: string;
  amount: number;
  category: string;
  cadence: string;
  last_date: string;
  hits: number;
}

export interface RecurringCharges {
  monthly_total: number;
  annual_total: number;
  items: RecurringItem[];
}

export interface NetWorthPoint {
  date: string;
  net_worth: number;
}

export interface AssetBreakdown {
  cash: number;
  invested: number;
  debt: number;
}

export interface TrendPoint {
  period_start: string;
  period_end: string;
  total: number;
  average: number;
  by_tier: TierTotals;
}

export interface KeepRatePoint {
  period_start: string;
  /** null when the period had no paycheck: undefined, not zero. */
  keep_rate: number | null;
  average: number | null;
}

export interface NetWorth {
  total: number;
  by_type: Record<string, number>;
}

export interface RothProgress {
  year: number;
  limit: number;
  contributed_ytd: number;
  remaining: number;
  percent: number;
}

export interface Paycheck {
  id: number;
  pay_date: string;
  gross: number;
  federal_tax: number;
  state_tax: number;
  social_security: number;
  medicare: number;
  insurance: number;
  retirement_401k: number;
  net: number;
  employer: string | null;
  parsed_by: string;
}

export interface SankeyData {
  nodes: { name: string }[];
  links: { source: number; target: number; value: number }[];
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings / HYSA",
  brokerage: "Brokerage",
  roth: "Roth IRA",
  _401k: "401(k)",
  credit: "Credit",
  other: "Other",
};

export interface ContributionGoal {
  account_type: string;
  year: number;
  limit: number;
  contributed_ytd: number;
  remaining: number;
  percent: number;
  /** Share of the year elapsed, for the pace marker. */
  pace_percent: number;
  behind: number;
  months_left: number;
  needed_per_month: number;
}
