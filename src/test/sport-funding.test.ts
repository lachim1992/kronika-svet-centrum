import { describe, it, expect } from 'vitest';
import { sportFundingExpense } from '../../supabase/functions/_shared/fiscal.ts';

describe('sport funding', () => {
  it('is a share of income, not of the treasury stock', () => {
    expect(sportFundingExpense(153.7, 5, 950081)).toBe(7);
  });
  it('is capped by the treasury', () => {
    expect(sportFundingExpense(1000, 100, 120)).toBe(120);
  });
  it('is zero without income or percentage', () => {
    expect(sportFundingExpense(0, 20, 500000)).toBe(0);
    expect(sportFundingExpense(500, 0, 500000)).toBe(0);
  });
  it('never returns a negative expense', () => {
    expect(sportFundingExpense(-5, 10, -10)).toBe(0);
  });
});
