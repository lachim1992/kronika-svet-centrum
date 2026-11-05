import { describe, expect, it } from 'vitest';
import { landedInputCost } from '../../supabase/functions/_shared/productMarket';

const quote = (overrides: Partial<Parameters<typeof landedInputCost>[0]> = {}) => ({
  sourcePrice: 2, transport: 1, tolls: 0, tariffRate: 0,
  risk: 0, loss: 0, ...overrides,
  it('passes higher input, freight, tariff and risk costs through to landed quotes monotonically', () => {
    const baseline = landedInputCost(quote()).landed;
    for (const increase of [
      { sourcePrice: 3 }, { transport: 2 }, { tolls: 1 },
      { tariffRate: 0.1 }, { risk: 0.2 }, { loss: 0.2 },
    ]) {
      expect(landedInputCost(quote(increase)).landed).toBeGreaterThan(baseline);
    }
    // An explicit destination tariff basis must not alter the quote when tariffs are zero.
    expect(landedInputCost(quote({ destinationPrice: 100 })).landed).toBe(baseline);
    expect(landedInputCost(quote({ destinationPrice: 100, tariffRate: 0.1 })).landed)
      .toBeGreaterThan(landedInputCost(quote({ destinationPrice: 5, tariffRate: 0.1 })).landed);
  });

});

describe('direct physical-trade landed quote guard', () => {
  it('preserves the valid landed cost and transport-loss calculation', () => {
    expect(landedInputCost(quote()).landed).toBe(3);
    expect(landedInputCost(quote({ loss: 0.25 })).landed).toBeCloseTo(4);
    expect(landedInputCost(quote({ tariffRate: 0.1, destinationPrice: 5 })).landed)
      .toBeCloseTo(3.5);
  });

  it('fails closed instead of silently pricing invalid input or transport as free', () => {
    for (const invalid of [
      { sourcePrice: -2 }, { sourcePrice: NaN }, { sourcePrice: Infinity },
      { transport: -1 }, { transport: Infinity }, { tolls: -1 },
      { tariffRate: -0.1 }, { risk: NaN }, { loss: -0.1 },
      { loss: 1 }, { loss: Infinity },
    ]) {
      expect(() => landedInputCost(quote(invalid))).toThrow(RangeError);
    }
  });

  it('rejects an invalid explicit destination tariff basis', () => {
    expect(() => landedInputCost(quote({ destinationPrice: -1 }))).toThrow(RangeError);
    expect(() => landedInputCost(quote({ destinationPrice: NaN }))).toThrow(RangeError);
    expect(landedInputCost(quote({ destinationPrice: 0 })).landed).toBe(3);
  });
});
