import { describe, expect, it } from 'vitest';
import { laggedProducerQuote } from './laggedProducerQuote';

/**
 * Pure contract test: previous committed costs affect a candidate ask, never
 * current market prices or a physical trade ledger.
 */
describe('lagged producer quote cost transmission', () => {
  const basis = {
    previousRealizedUnits: 10,
    previousIntermediateCost: 40,
    previousWageCost: 30,
    previousCapitalWear: 10,
    markupRate: 0.25,
  };

  it('transmits an increase in each historical cost component to the ask', () => {
    const original = laggedProducerQuote(basis);
    expect(original).toEqual({ historicalUnitCost: 8, askPrice: 10 });
    for (const field of ['previousIntermediateCost', 'previousWageCost', 'previousCapitalWear'] as const) {
      const increased = laggedProducerQuote({ ...basis, [field]: basis[field] + 10 });
      expect(increased?.historicalUnitCost).toBe(9);
      expect(increased?.askPrice).toBe(11.25);
    }
  });

  it('does not mutate the previous committed accounting snapshot', () => {
    const input = Object.freeze({ ...basis });
    const first = laggedProducerQuote(input);
    const second = laggedProducerQuote(input);
    expect(second).toEqual(first);
    expect(input).toEqual(basis);
  });
});
