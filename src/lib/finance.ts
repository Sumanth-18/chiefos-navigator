export interface Expense {
  id: string;
  project_id: string | null;
  user_id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  created_at: string;
}

export interface AttritionEvent {
  id: string;
  employee_id: string | null;
  user_id: string;
  exit_date: string;
  reason: string | null;
  logged_by: string | null;
  created_at: string;
}

export type DealStage = 'Lead' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost';

export interface Deal {
  id: string;
  user_id: string;
  client_name: string;
  value: number;
  stage: DealStage;
  expected_close_date: string | null;
  owner_id: string | null;
  won_at: string | null;
  created_at: string;
}

export const EXPENSE_CATEGORIES = ['Salaries', 'Tools', 'Vendor', 'Other'] as const;

export const STAGE_PROBABILITY: Record<DealStage, number> = {
  Lead: 0.1,
  Proposal: 0.3,
  Negotiation: 0.6,
  Won: 1,
  Lost: 0,
};

export function formatINR(n: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

export type VarianceTone = 'green' | 'amber' | 'red';

/** Variance = budget - actual. Green under budget, red over, amber within 10% of budget. */
export function varianceTone(budget: number, actual: number): VarianceTone {
  if (budget <= 0) return actual > 0 ? 'red' : 'green';
  const variance = budget - actual;
  if (variance < 0) return 'red';
  if (variance / budget <= 0.1) return 'amber';
  return 'green';
}

export const toneClass: Record<VarianceTone, string> = {
  green: 'text-success',
  amber: 'text-warning',
  red: 'text-destructive',
};
