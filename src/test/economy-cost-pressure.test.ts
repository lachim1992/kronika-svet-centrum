import { describe, expect, it } from 'vitest';
import { producerAccount } from '../../supabase/functions/_shared/productMarket';
import { PRODUCER_COST_FIELDS, formatField } from '../lib/economyFieldContract';

const account = (intermediate: number, realized = 10) => producerAccount({
  realized, revenue: 40, intermediate, capitalWear: 0,
  employed: 10, wage: 0.5, material: intermediate, operating: 0,
});

describe('canonical producer cost pressure (diagnostic, not price pass-through)', () => {
  it('a dearer input lowers the unit gap at unchanged output valuation', () => {
    const cheap = account(10);
    const dear = account(30);
    const loss = account(50);
    expect(cheap.unit_cost_gap).toBeCloseTo(2.5, 9);
    expect(dear.unit_cost_gap).toBeCloseTo(0.5, 9);
    expect(loss.unit_cost_gap).toBeCloseTo(-1.5, 9);
    expect(cheap.unit_cost_gap! - dear.unit_cost_gap!).toBeCloseTo(2, 9);
    expect(dear.unit_cost_gap).toBeCloseTo(dear.operating_surplus / 10, 9);
  });

  it('does not fabricate a unit gap when there is no physical output', () => {
    expect(account(20, 0).unit_cost_gap).toBeNull();
  });

  it('shows comparable full-cost coverage as inputs become dearer, without changing prices', () => {
    const cheap = account(10), dear = account(30), loss = account(50);
    expect(cheap.full_cost_coverage).toBeCloseTo(40 / 15, 9);
    expect(dear.full_cost_coverage).toBeCloseTo(40 / 35, 9);
    expect(loss.full_cost_coverage).toBeCloseTo(40 / 55, 9);
    expect(cheap.full_cost_coverage!).toBeGreaterThan(dear.full_cost_coverage!);
    expect(dear.full_cost_coverage!).toBeGreaterThan(1);
    expect(loss.full_cost_coverage!).toBeLessThan(1);
    expect(account(10, 0).full_cost_coverage).toBeNull();
    expect(account(0, 10).full_cost_coverage).toBeCloseTo(40 / 5, 9);
  });

  it('does not divide by zero or invent cash coverage when costs are absent', () => {
    const noCost = producerAccount({ realized: 10, revenue: 40, intermediate: 0, capitalWear: 0, employed: 0, wage: 0 });
    expect(noCost.full_cost_coverage).toBeNull();
  });

  it('maps the exact engine value into the shared Economy/Dev cost contract', () => {
    const field = PRODUCER_COST_FIELDS.find(f => f.key === 'unit_cost_gap');
    expect(field).toBeDefined();
    expect(formatField(field!, account(50)).missing).toBe(false);
    expect(formatField(field!, account(20, 0))).toEqual({ text: 'zatím není', missing: true });
  });
});
