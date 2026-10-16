import { describe, it, expect } from 'vitest';
import { settleWages } from '../../supabase/functions/_shared/wageSettlement';

const conserved = (s: ReturnType<typeof settleWages>) => s.cities.forEach(c => {
  expect(c.producer_cash_opening + c.producer_cash_pool).toBeCloseTo(c.wages_paid + c.ownership_income_paid + c.producer_cash_closing);
  expect(c.producer_cash_closing).toBeGreaterThanOrEqual(0);
  expect(c.payroll_due + c.arrears_opening - c.wages_paid).toBeCloseTo(c.arrears_closing);
  expect(c.household_wage_income).toBe(c.wages_paid);
  expect(c.ownership_income_due - c.ownership_income_paid).toBeCloseTo(c.ownership_unpaid);
  for (const v of [c.wages_paid, c.arrears_closing, c.producer_retained, c.ownership_income_paid, c.ownership_unpaid]) expect(v).toBeGreaterThanOrEqual(0);
});

describe('canonical wage settlement', () => {
  it('pays full payroll from producer cash; household income equals wages paid; treasury untouched', () => {
    const s = settleWages(5, [{ city: 'A', producer_payroll: 30, goods_value_added: 100 }]);
    conserved(s);
    expect(s.cities[0]).toMatchObject({ wages_paid: 30, household_wage_income: 30, producer_retained: 70, arrears_closing: 0 });
    expect(s.treasury_effect).toBe(0);
  });
  it('never pays more than producer cash (no money created, no negative funds) and carries arrears over 2 turns', () => {
    const t1 = settleWages(1, [{ city: 'A', producer_payroll: 50, goods_value_added: 20 }, { city: 'B', producer_payroll: 10, goods_value_added: -5 }]);
    conserved(t1);
    expect(t1.cities[0]).toMatchObject({ wages_paid: 20, arrears_closing: 30, producer_retained: 0 });
    expect(t1.cities[1]).toMatchObject({ wages_paid: 0, arrears_closing: 10, producer_cash_pool: 0 });
    const t2 = settleWages(2, [{ city: 'A', producer_payroll: 50, goods_value_added: 100 }, { city: 'B', producer_payroll: 10, goods_value_added: 15 }], t1);
    conserved(t2);
    expect(t2.cities[0]).toMatchObject({ arrears_opening: 30, wages_paid: 80, arrears_closing: 0, producer_retained: 20 });
    expect(t2.cities[1]).toMatchObject({ wages_paid: 15, arrears_closing: 5 });
    // Cumulative: everything ever paid came out of producer cash pools.
    expect(t1.totals.wages_paid + t2.totals.wages_paid).toBeLessThanOrEqual(t1.totals.producer_cash_pool + t2.totals.producer_cash_pool);
  });
  it('is idempotent: a retry of the same turn returns the persisted settlement, never pays twice', () => {
    const t1 = settleWages(3, [{ city: 'A', producer_payroll: 40, goods_value_added: 10 }]);
    const again = settleWages(3, [{ city: 'A', producer_payroll: 40, goods_value_added: 10 }], t1);
    expect(again.cities).toEqual(t1.cities);
    expect((again as any).replay).toBe(true);
    expect(again.cities[0].arrears_opening).toBe(0);
  });
  it('reconciles imputed proxy labour income against settled cash without changing payment', () => {
    const s = settleWages(4, [{ city: 'A', producer_payroll: 30, goods_value_added: 20, labor_income: 50 }, { city: 'B', producer_payroll: 5, goods_value_added: 10 }]);
    conserved(s);
    expect(s.cities[0]).toMatchObject({ wages_paid: 20, imputed_labor_income: 50, imputed_minus_settled: 30, settled_share_of_imputed: 0.4 });
    expect(s.cities[1]).toMatchObject({ wages_paid: 5, imputed_labor_income: 0, settled_share_of_imputed: null });
    expect(s.totals).toMatchObject({ imputed_labor_income: 50, imputed_minus_settled: 25 });
    expect(s.household_income_basis).toBe('settled_when_available');
    expect(s.treasury_effect).toBe(0);
  });
  it('carries producer cash stock between turns and pays arrears from it', () => {
    const t1 = settleWages(1, [{ city: 'A', producer_payroll: 10, goods_value_added: 50 }]);
    conserved(t1);
    expect(t1.cities[0]).toMatchObject({ producer_cash_opening: 0, producer_cash_closing: 40 });
    const t2 = settleWages(2, [{ city: 'A', producer_payroll: 30, goods_value_added: 5 }], t1);
    conserved(t2);
    expect(t2.cities[0]).toMatchObject({ producer_cash_opening: 40, wages_paid: 30, arrears_closing: 0, producer_cash_closing: 15, producer_retained: 0 });
    expect(settleWages(2, [], t2).cities[0].producer_cash_closing).toBe(15);
  });
  it('pays ownership income from producer cash AFTER wages; unpaid profit is not a debt', () => {
    // Plenty of cash: wages first, then the full ownership payout; closing keeps the rest.
    const t1 = settleWages(1, [{ city: 'A', producer_payroll: 30, goods_value_added: 100, capital_income: 20 }]);
    conserved(t1);
    expect(t1.cities[0]).toMatchObject({ wages_paid: 30, ownership_income_due: 20, ownership_income_paid: 20, ownership_unpaid: 0, producer_cash_closing: 50 });
    expect(t1.totals.ownership_income_paid).toBe(20);
    expect(t1.ownership_income_basis).toBe('settled_spent');
    expect(t1.household_income_basis).toBe('settled_when_available');
    expect(t1.treasury_effect).toBe(0);
    // Tight cash: wages consume everything, ownership payout is 0 and NOT carried as arrears.
    const t2 = settleWages(2, [{ city: 'A', producer_payroll: 60, goods_value_added: 10, capital_income: 25 }], t1);
    conserved(t2);
    expect(t2.cities[0]).toMatchObject({ wages_paid: 60, arrears_closing: 0, ownership_income_paid: 0, ownership_unpaid: 25, producer_cash_closing: 0 });
    const t3 = settleWages(3, [{ city: 'A', producer_payroll: 0, goods_value_added: 10, capital_income: 25 }], t2);
    conserved(t3);
    // The unpaid 25 from turn 2 does not come back: only this turn's due is paid.
    expect(t3.cities[0]).toMatchObject({ ownership_income_due: 25, ownership_income_paid: 10, ownership_unpaid: 15, producer_cash_closing: 0 });
    // No capital_income input → behaviour identical to before (backward compatible).
    const legacy = settleWages(4, [{ city: 'A', producer_payroll: 10, goods_value_added: 50 }]);
    conserved(legacy);
    expect(legacy.cities[0]).toMatchObject({ ownership_income_due: 0, ownership_income_paid: 0, producer_cash_closing: 40 });
  });
});
