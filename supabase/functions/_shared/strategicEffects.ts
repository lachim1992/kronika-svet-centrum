/** Canonical strategic resource tier effects — one source for process-turn, resolve-battle and command-dispatch. */
export const STRATEGIC_TIER_BONUSES: Record<string, Record<number, any>> = {
  iron: { 1: { combat_mult: 1.05 }, 2: { combat_mult: 1.12, heavy_infantry: true }, 3: { combat_mult: 1.20, elite_units: true } },
  horses: { 1: { mobility: 1.1 }, 2: { cavalry_doctrine: true, mobility: 1.2 }, 3: { cavalry_doctrine: true, mobility: 1.35 } },
  salt: { 1: { supply_bonus: 0.05 }, 2: { supply_bonus: 0.12 }, 3: { supply_bonus: 0.20 } },
  copper: { 1: { wealth_mult: 1.05 }, 2: { wealth_mult: 1.10 }, 3: { wealth_mult: 1.15 } },
  gold: { 1: { mercenary_access: true, wealth_mult: 1.08 }, 2: { wealth_mult: 1.15 }, 3: { wealth_mult: 1.25 } },
  marble: { 1: { build_cost_mult: 0.90, cultural_prestige: 2 }, 2: { build_cost_mult: 0.80, cultural_prestige: 5 }, 3: { build_cost_mult: 0.70, cultural_prestige: 10 } },
  gems: { 1: { wealth_mult: 1.05, faith_bonus: 1 }, 2: { wealth_mult: 1.10, faith_bonus: 3 }, 3: { wealth_mult: 1.15, faith_bonus: 5 } },
  timber: { 1: { travel_cost_mult: 0.90 }, 2: { travel_cost_mult: 0.80, naval: true }, 3: { travel_cost_mult: 0.70, naval_dominance: true } },
  obsidian: { 1: { combat_mult: 1.05, faith_bonus: 1 }, 2: { combat_mult: 1.10, faith_bonus: 3 }, 3: { combat_mult: 1.15, faith_bonus: 5 } },
  silk: { 1: { wealth_mult: 1.05, diplomacy_bonus: 1 }, 2: { wealth_mult: 1.10, diplomacy_bonus: 3 }, 3: { wealth_mult: 1.20, diplomacy_bonus: 5 } },
  incense: { 1: { faith_bonus: 2, wealth_mult: 1.03 }, 2: { faith_bonus: 5, stability_bonus: 2 }, 3: { faith_bonus: 8, stability_bonus: 5 } },
};

/** Integer tier 0..3; anything else (negative, NaN, fractional, >3) is 0 — fail closed to no bonus. */
export function strategicTier(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 0;
}

/** Combat multiplier of one realm (iron × obsidian). Missing realm (neutral) = 1. */
export function strategicCombatMult(realm: any | null | undefined): number {
  if (!realm) return 1;
  const i = STRATEGIC_TIER_BONUSES.iron[strategicTier(realm.strategic_iron_tier)]?.combat_mult ?? 1;
  const o = STRATEGIC_TIER_BONUSES.obsidian[strategicTier(realm.strategic_obsidian_tier)]?.combat_mult ?? 1;
  return i * o;
}

export function strategicBuildCostMult(realm: any | null | undefined): number {
  if (!realm) return 1;
  return STRATEGIC_TIER_BONUSES.marble[strategicTier(realm.strategic_marble_tier)]?.build_cost_mult ?? 1;
}

/** Discounted cost, rounded up to a whole unit (never below 0, never above the base). */
export function discountedCost(base: number, mult: number): number {
  const b = Number(base);
  if (!Number.isFinite(b) || b <= 0) return 0;
  const m = Number.isFinite(mult) && mult > 0 && mult <= 1 ? mult : 1;
  return Math.min(Math.ceil(b), Math.ceil(b * m - 1e-9));
}
