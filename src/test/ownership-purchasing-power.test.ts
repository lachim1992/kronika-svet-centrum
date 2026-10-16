import { describe, it, expect } from 'vitest';
import { cityAccounts, PRODUCT_MARKET as M } from '../../supabase/functions/_shared/productMarket';
import { settleWages } from '../../supabase/functions/_shared/wageSettlement';

const base = { city: 'c', valueAdded: 100, householdTaxRate: 0.1, needs: [], discretionaryWish: 0, basketConsumption: {} };
describe('settled owner income feeds purchasing power', () => {
  it('legacy game without settlement keeps the GDP proxy', () => {
    const a = cityAccounts(base);
    expect(a.capital_income_basis).toBe('imputed_proxy');
    expect(a.capital_income).toBeCloseTo(a.ownership_income_claim, 9);
  });
  it('uses actually paid wages + ownership, no extra money', () => {
    const a = cityAccounts({ ...base, settledWageIncome: 30, settledOwnershipIncome: 5 });
    expect(a.capital_income_basis).toBe('settled_ownership');
    expect(a.household_income).toBeCloseTo((30 + 5) * M.incomeUnitFactor, 9);
  });
  it('settlement due uses real after-wage profit, not last payout; cash conserved', () => {
    const a = cityAccounts({ ...base, settledWageIncome: 30, settledOwnershipIncome: 0 });
    const s = settleWages(2, [{ city: 'c', producer_payroll: 30, goods_value_added: 40, capital_income: a.capital_income, ownership_income_claim: a.ownership_income_claim }]);
    const c = s.cities[0];
    expect(c.ownership_income_due).toBeCloseTo(M.localCapitalShare * 10, 3);
    expect(c.producer_cash_opening + c.producer_cash_pool).toBeCloseTo(c.wages_paid + c.ownership_income_paid + c.producer_cash_closing, 3);
    expect(c.producer_cash_closing).toBeGreaterThanOrEqual(0);
  });
});

describe('purchasing-power calibration', () => {
  it('ownership due is the owner share of real after-wage profit in cash units (no double unit conversion)', () => {
    const s = settleWages(3, [{ city: 'c', producer_payroll: 30, goods_value_added: 100, capital_income: 999 }]);
    expect(s.cities[0].ownership_income_due).toBeCloseTo(M.localCapitalShare * 70, 3);
    expect(s.cities[0].ownership_income_paid).toBeCloseTo(M.localCapitalShare * 70, 3);
  });
  it('cash coverage = 1 when paid wages match the proxy labour share; then income equals the proxy', () => {
    const w = 100 * M.laborShare, own = M.localCapitalShare * (100 - w);
    const a = cityAccounts({ ...base, settledWageIncome: w, settledOwnershipIncome: own });
    expect(a.settled_income_coverage).toBeCloseTo(1, 9);
    expect(a.household_income).toBeCloseTo(cityAccounts(base).household_income, 9);
  });
  it('low wages reduce coverage below 1; legacy has no coverage', () => {
    const a = cityAccounts({ ...base, settledWageIncome: 10, settledOwnershipIncome: 6 });
    expect(a.settled_income_coverage).toBeLessThan(1);
    expect(cityAccounts(base).settled_income_coverage).toBeNull();
  });
});
