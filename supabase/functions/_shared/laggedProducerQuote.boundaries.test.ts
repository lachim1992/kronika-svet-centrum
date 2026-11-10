import { describe, expect, it } from 'vitest';
import { laggedProducerQuote } from './laggedProducerQuote';

/**
 * Regression for #28: strictly positive committed costs must never turn into
 * a zero-priced producer offer through IEEE-754 underflow.
 * This is a pure read-only test; no trade, fiscal, or turn mutations.
 */
describe('lagged producer quote numerical boundaries', () => {
  it('rejects a unit cost that underflows to zero despite positive committed costs', () => {
    expect(laggedProducerQuote({
      previousRealizedUnits: 1e100,
      previousIntermediateCost: 1e-300,
      previousWageCost: 0,
      previousCapitalWear: 0,
      markupRate: 0.25,
    })).toBeNull();
  });

  it('rejects a zero ask when a positive unit cost underflows during markup calculation', () => {
    // A valid positive subnormal unit cost is still representable and should
    // not be mistaken for a missing accounting basis.
    const quote = laggedProducerQuote({
      previousRealizedUnits: 1,
      previousIntermediateCost: Number.MIN_VALUE,
      previousWageCost: 0,
      previousCapitalWear: 0,
      markupRate: 0,
    });
    expect(quote).toEqual({
      historicalUnitCost: Number.MIN_VALUE,
      askPrice: Number.MIN_VALUE,
    });
  });

  it('rejects arithmetic overflow in historical cost aggregation', () => {
    expect(laggedProducerQuote({
      previousRealizedUnits: 1,
      previousIntermediateCost: Number.MAX_VALUE,
      previousWageCost: Number.MAX_VALUE,
      previousCapitalWear: 0,
      markupRate: 0,
    })).toBeNull();
  });
});
