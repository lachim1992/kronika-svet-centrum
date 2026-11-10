/** Deficit share at which a shortage counts at all (projection noise below). */
export const FOOD_DEFICIT_MINOR = 0.05;
/** Deficit share at which it is a real famine (deaths). Between the two: rationing, no deaths. */
export const FOOD_FAMINE = 0.15;

/** Fractional shortages must not kill the same population as a total crop failure.
 * A mild deficit (5–15 %) is rationing: -1 stability, no deaths, not a famine. */
export function foodShortageImpact(population: number, demand: number, deficit: number) {
  const ratio = demand > 0 ? Math.max(0, Math.min(1, deficit / demand)) : 0;
  const minor = ratio >= FOOD_DEFICIT_MINOR && ratio < FOOD_FAMINE;
  const famine = ratio >= FOOD_FAMINE;
  return { ratio, famine, minor, deaths: famine ? Math.floor(Math.max(0, population) * 0.05 * ratio) : 0,
    stabilityLoss: famine ? Math.max(1, Math.round(5 * ratio)) : minor ? 1 : 0 };
}
