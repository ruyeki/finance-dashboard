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
