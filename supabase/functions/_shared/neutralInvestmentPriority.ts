/**
 * Read-only municipal priority calculation. This is NOT a fiscal or goods writer.
 * Only committed basket shortages influence priorities; no projected new-turn data.
 */
export interface NeedObservation {
  city_id: string;
  turn_number: number;
  basket_key: string;
  local_demand: number | string | null;
  unmet_demand: number | string | null;
}
export interface InvestmentCandidate {
  city_id: string;
  action: string;
  reason?: { chosen_template?: string } | null;
}
const clamp = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};
const relevantBasket = (plan: InvestmentCandidate): string | null => {
  if (plan.action === "build_well") return "drinking_water";
  const template = plan.reason?.chosen_template;
  if (template === "Sýpka") return "staple_food";
  if (template === "Uhlířství") return "fuel";
  return null;
};
/**
 * Urgent need outranks routine construction. A prior committed measurement is
 * preferred to an older measurement. Missing data has zero priority, not a
 * fictitious shortage. Stable rotating tie-break prevents permanent starvation.
 */
export function rankNeutralInvestmentPlans<T extends InvestmentCandidate>(
  plans: readonly T[],
  observations: readonly NeedObservation[],
  closedTurn: number,
): T[] {
  const latest = new Map<string, NeedObservation>();
  for (const row of observations) {
    if (!Number.isInteger(row.turn_number) || row.turn_number > closedTurn) continue;
    const key = row.city_id + "|" + row.basket_key;
    const prior = latest.get(key);
    if (!prior || row.turn_number > prior.turn_number) latest.set(key, row);
  }
  const canonical = [...plans].sort((a, b) => a.city_id.localeCompare(b.city_id));
  const shift = canonical.length ? ((closedTurn * 2) % canonical.length + canonical.length) % canonical.length : 0;
  const rotated = [...canonical.slice(shift), ...canonical.slice(0, shift)];
  const rank = (p: T): number => {
    const basket = relevantBasket(p);
    if (!basket) return 0;
    const row = latest.get(p.city_id + "|" + basket);
    if (!row) return 0;
    const unmet = clamp(row.unmet_demand);
    if (unmet === 0) return 0;
    // Cap outliers; demand of zero must not turn any positive shortage into infinity.
    const fraction = Math.min(1, unmet / Math.max(1, clamp(row.local_demand)));
    const weight = basket === "drinking_water" ? 3 : basket === "staple_food" ? 2 : 1;
    return fraction * weight;
  };
  // Stable sort is explicit via original rotated position.
  return rotated.map((plan, index) => ({ plan, index, priority: rank(plan) }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .map((entry) => entry.plan);
}

/**
 * Shared action-slot allocation for municipal survival vs territorial growth.
 * Territorial claims remain optional and their payment still goes through
 * command-dispatch. Emergency deficits must never be sacrificed for expansion.
 * No new treasury or resource ledger is introduced here.
 */
export function allocateNeutralInvestmentSlots(
  rankedPlans: readonly InvestmentCandidate[],
  observations: readonly NeedObservation[],
  closedTurn: number,
  hasExpansionProposal: boolean,
): { buildingLimit: number; expansionLimit: number; rationale: string } {
  const canExpand = hasExpansionProposal && closedTurn % 3 === 0;
  if (!canExpand) return { buildingLimit: 2, expansionLimit: 0, rationale: "building_cycle" };
  // A material shortage is critical only if a candidate construction addresses it.
  const latest = new Map<string, NeedObservation>();
  for (const row of observations) {
    if (!Number.isInteger(row.turn_number) || row.turn_number > closedTurn) continue;
    const key = row.city_id + "|" + row.basket_key;
    const prior = latest.get(key);
    if (!prior || row.turn_number > prior.turn_number) latest.set(key, row);
  }
  const critical = rankedPlans.some(plan => {
    const basket = relevantBasket(plan);
    if (!basket || basket === "fuel") return false;
    const row = latest.get(plan.city_id + "|" + basket);
    if (!row) return false;
    const demand = clamp(row.local_demand);
    return demand > 0 && clamp(row.unmet_demand) / demand >= 0.5;
  });
  return critical
    ? { buildingLimit: 2, expansionLimit: 0, rationale: "critical_needs_first" }
    : { buildingLimit: 1, expansionLimit: 1, rationale: "balanced_investment" };
}
