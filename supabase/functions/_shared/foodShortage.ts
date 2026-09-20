/** Fractional shortages must not kill the same population as a total crop failure. */
export function foodShortageImpact(population: number, demand: number, deficit: number) {
  const ratio = demand > 0 ? Math.max(0, Math.min(1, deficit / demand)) : 0;
  // Ignore projection rounding noise; report smaller shortages through basket satisfaction.
  const famine = ratio >= 0.05;
  return { ratio, famine, deaths: famine ? Math.floor(Math.max(0, population) * 0.05 * ratio) : 0,
    stabilityLoss: famine ? Math.max(1, Math.round(5 * ratio)) : 0 };
}
