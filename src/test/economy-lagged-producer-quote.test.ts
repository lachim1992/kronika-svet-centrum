import { describe, expect, it } from 'vitest';
import { laggedProducerQuote } from '../../supabase/functions/_shared/laggedProducerQuote';

const historical = {
  previousRealizedUnits: 10,
  previousIntermediateCost: 40,
  previousWageCost: 30,
  previousCapitalWear: 10,
  markupRate: 0.25,
};

describe('lagged producer quote candidate (not a clearing price)', () => {
  it('derives an ask from previously committed costs only', () => {
    expect(laggedProducerQuote(historical)).toEqual({ historicalUnitCost: 8, askPrice: 10 });
    expect(laggedProducerQuote({ ...historical, previousIntermediateCost: 60 }))
      .toEqual({ historicalUnitCost: 10, askPrice: 12.5 });
  });

  it('does not invent an ask for absent production or invalid historical data', () => {
    expect(laggedProducerQuote({ ...historical, previousRealizedUnits: 0 })).toBeNull();
    expect(laggedProducerQuote({ ...historical, previousWageCost: -1 })).toBeNull();
    expect(laggedProducerQuote({ ...historical, markupRate: -0.1 })).toBeNull();
    expect(laggedProducerQuote({ ...historical, previousIntermediateCost: Number.NaN })).toBeNull();
    expect(laggedProducerQuote({ ...historical, previousCapitalWear: Infinity })).toBeNull();
  });

  it('rejects arithmetic overflow rather than producing an infinite quote', () => {
    expect(laggedProducerQuote({ ...historical, previousIntermediateCost: Number.MAX_VALUE,
      previousWageCost: Number.MAX_VALUE })).toBeNull();
    expect(laggedProducerQuote({ ...historical, markupRate: Number.MAX_VALUE })).toBeNull();
  });

  it('is pure and deterministic and does not mutate the prior-turn record', () => {
    const before = JSON.stringify(historical);
    expect(laggedProducerQuote(historical)).toEqual(laggedProducerQuote(historical));
    expect(JSON.stringify(historical)).toBe(before);
  });
});
