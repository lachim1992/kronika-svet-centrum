import { describe, expect, it } from "vitest";
import { laggedProducerQuote } from "../../supabase/functions/_shared/laggedProducerQuote.ts";

describe("lagged producer ask zero-cost safety", () => {
  const base = {
    previousRealizedUnits: 10,
    previousIntermediateCost: 60,
    previousWageCost: 20,
    previousCapitalWear: 0,
    markupRate: 0.25,
  };

  it("refuses missing historical cost basis instead of issuing a free offer", () => {
    expect(laggedProducerQuote({ ...base, previousIntermediateCost: 0, previousWageCost: 0 })).toBeNull();
  });

  it("preserves a positive historical ask and does not mutate its inputs", () => {
    const input = { ...base };
    expect(laggedProducerQuote(input)).toEqual({ historicalUnitCost: 8, askPrice: 10 });
    expect(input).toEqual(base);
  });
});
