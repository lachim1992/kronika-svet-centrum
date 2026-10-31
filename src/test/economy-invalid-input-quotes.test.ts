import { describe, expect, it } from 'vitest';
import { expectedInputCost } from '../../supabase/functions/_shared/productMarket';

const supplier = (overrides: Partial<Parameters<typeof expectedInputCost>[1][number]> = {}) => ({
  city: 'mine', sourcePrice: 2, transport: 1, tolls: 0,
  tariffRate: 0, risk: 0, loss: 0, ...overrides,
});

describe('expected input sourcing rejects invalid quotes', () => {
  it('does not turn a negative local price into a free local input', () => {
    expect(expectedInputCost(-4, [], 10)).toEqual({
      cost: Infinity, source: 'unavailable', available: false,
    });
    expect(expectedInputCost(-4, [supplier()], 10)).toEqual({
      cost: 3, source: 'mine', available: true,
    });
  });

  it('ignores invalid route costs, source prices, tariffs, and fully lost shipments', () => {
    for (const bad of [
      { sourcePrice: -1 }, { sourcePrice: NaN }, { transport: Infinity },
      { transport: -1 }, { tolls: -1 }, { tariffRate: -0.1 },
      { risk: NaN }, { loss: -0.1 }, { loss: 1 },
    ]) {
      const result = expectedInputCost(null, [supplier(bad)], 10);
      expect(result.available, JSON.stringify(bad)).toBe(false);
      expect(result.cost).toBe(Infinity);
    }
  });

  it('rejects invalid destination reference prices instead of discounting tariffs', () => {
    expect(expectedInputCost(null, [supplier({ tariffRate: 0.2 })], 10, -5).available).toBe(false);
    expect(expectedInputCost(null, [supplier({ tariffRate: 0.2 })], 10, NaN).available).toBe(false);
    expect(expectedInputCost(null, [supplier({ tariffRate: 0.2 })], 10, 5).cost).toBeCloseTo(4);
  });

  it('does not reject a valid supplier because an unused destination quote is corrupt', () => {
    // A valid local price is the tariff basis, so the optional destination quote is ignored.
    const result = expectedInputCost(10, [supplier()], 10, NaN);
    expect(result).toEqual({ cost: 3, source: 'mine', available: true });
  });

  it('keeps legitimate local and landed sourcing deterministic and unchanged', () => {
    expect(expectedInputCost(1, [supplier()], 10)).toEqual({
      cost: 1, source: 'local', available: true,
    });
    const quotes = [supplier({ transport: 3 }), supplier({ city: 'near', transport: 0.5 })];
    const result = expectedInputCost(null, quotes, 10);
    expect(result).toEqual({ cost: 2.5, source: 'near', available: true });
    expect(expectedInputCost(null, quotes, 10)).toEqual(result);
  });
});
