/**
 * Read-only candidate producer ask based exclusively on a PREVIOUS committed
 * turn's accounting snapshot. This helper does not clear trades, set market
 * prices, mutate cash, or add a physical ledger.
 *
 * The caller must supply the prior committed unit costs explicitly; never
 * feed current-turn provisional prices into this function.
 */
export interface LaggedProducerQuoteInput {
  /** Physical units completed in the previous committed turn. */
  previousRealizedUnits: number;
  /** Previously settled material and operating costs in money units. */
  previousIntermediateCost: number;
  /** Previously settled wage expense in the same money units. */
  previousWageCost: number;
  /** Previously recorded capital consumption in the same money units. */
  previousCapitalWear: number;
  /** Desired gross markup over historical unit cost, e.g. 0.1 = 10%. */
  markupRate: number;
}

export interface LaggedProducerQuote {
  historicalUnitCost: number;
  askPrice: number;
}

/**
 * Returns null when there is no valid prior production/cost basis. It does not
 * silently substitute a market price, zero cost, or a speculative estimate.
 */
export function laggedProducerQuote(input: LaggedProducerQuoteInput): LaggedProducerQuote | null {
  const { previousRealizedUnits: units, previousIntermediateCost: materials,
    previousWageCost: wages, previousCapitalWear: wear, markupRate } = input;
  if (![units, materials, wages, wear, markupRate].every(Number.isFinite) ||
      units <= 0 || materials < 0 || wages < 0 || wear < 0 || markupRate < 0) return null;
  const total = materials + wages + wear;
  if (!Number.isFinite(total)) return null;
  const historicalUnitCost = total / units;
  const askPrice = historicalUnitCost * (1 + markupRate);
  if (!Number.isFinite(historicalUnitCost) || !Number.isFinite(askPrice)) return null;
  return { historicalUnitCost, askPrice };
}
