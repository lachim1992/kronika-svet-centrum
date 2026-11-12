/**
 * A hamlet founded on the starter parcel footprint begins as a small settlement,
 * not an instantly populated 1,000-person city. Its food/water infrastructure
 * and claimed plots are calibrated for approximately this population.
 *
 * NOTE: This reduces the legacy ex-nihilo founding bug but does NOT implement
 * the future atomic transfer of settlers from the rural-population ledger.
 * Do not claim conservation until that Phase C transfer exists.
 */
export const FOUNDING_HAMLET_POPULATION = 100;

export function foundingHamletPopulation() {
  const total = FOUNDING_HAMLET_POPULATION;
  return {
    population_total: total,
    population_peasants: 80,
    population_burghers: 15,
    population_clerics: 5,
    population_warriors: 0,
  } as const;
}
