/**
 * Canonical starting size and class composition for a newly founded hamlet.
 * The 100 residents are transferred from nearby rural cells by
 * found_city_with_rural_settlers; this helper is only a class-composition reference
 * and must never be used to mint population directly.
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
