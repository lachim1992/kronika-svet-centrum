/**
 * Shared World Physics Module
 * Single source of truth for settlement growth, influence, tension, and rebellion.
 * Used by both world-tick (turn-based) and process-tick (persistent/real-time).
 */

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════

export const CRISIS_THRESHOLD = 65;
export const WAR_THRESHOLD = 88;

// Population growth (from process-turn — most sophisticated)
export const POP_GROWTH_BASE = 0.01;
export const POP_GROWTH_MAX = 0.05;
export const POP_GROWTH_MIN = -0.03;
export const POP_MIN = 50;

// Rebellion
export const REBELLION_STABILITY_THRESHOLD = 30;
export const REBELLION_SEVERE_THRESHOLD = 15;
export const REBELLION_ROLL_THRESHOLD_NORMAL = 0.7;
export const REBELLION_ROLL_THRESHOLD_SEVERE = 0.4;
export const REBELLION_POP_LOSS_RATE = 0.1;
export const REBELLION_STABILITY_LOSS = 15;

// Stability drift
export const STABILITY_BASELINE = 60;

// Reputation
export const REPUTATION_DECAY = 0.9;
export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;

// Settlement templates (population layer ratios)
export const SETTLEMENT_TEMPLATES: Record<string, { peasants: number; burghers: number; clerics: number }> = {
  HAMLET:   { peasants: 0.80, burghers: 0.15, clerics: 0.05 },
  TOWNSHIP: { peasants: 0.60, burghers: 0.30, clerics: 0.10 },
  CITY:     { peasants: 0.40, burghers: 0.40, clerics: 0.20 },
  POLIS:    { peasants: 0.20, burghers: 0.55, clerics: 0.25 },
};

// Settlement wealth income per tier
export const SETTLEMENT_WEALTH: Record<string, number> = {
  HAMLET: 1, TOWNSHIP: 2, CITY: 4, POLIS: 6,
};

// Development thresholds
export const DEV_THRESHOLDS = [
  { pop: 500, level: 2 },
  { pop: 2000, level: 3 },
  { pop: 5000, level: 4 },
  { pop: 10000, level: 5 },
];

// ═══════════════════════════════════════════
// SETTLEMENT GROWTH
// ═══════════════════════════════════════════

export interface CityForGrowth {
  id: string;
  name: string;
  owner_player: string;
  status: string;
  population_total: number;
  population_peasants: number;
  population_burghers: number;
  population_clerics: number;
  city_stability: number;
  famine_turn: boolean;
  development_level: number;
}

export interface GrowthResult {
  cityId: string;
  cityName: string;
  oldPop: number;
  newPop: number;
  delta: number;
  newDev: number;
  newStability: number;
}

export function computeSettlementGrowth(
  city: CityForGrowth,
  opts: { hasRebellion?: boolean; hasTrade?: boolean } = {}
): GrowthResult {
  if (city.status !== "ok") {
    return {
      cityId: city.id, cityName: city.name,
      oldPop: city.population_total, newPop: city.population_total,
      delta: 0, newDev: city.development_level, newStability: city.city_stability,
    };
  }

  const stability = city.city_stability || 70;

  // Growth rate: base + stability factor + war/famine factor
  const stabilityFactor = (stability - 50) / 200;
  const famineFactor = city.famine_turn ? -0.02 : 0;
  const warFactor = (city.status === "besieged" || city.status === "devastated") ? -0.02 : 0;
  const tradeFactor = opts.hasTrade ? 0.005 : 0;
  
  let growthRate = POP_GROWTH_BASE + stabilityFactor + famineFactor + warFactor + tradeFactor;
  growthRate = Math.max(POP_GROWTH_MIN, Math.min(POP_GROWTH_MAX, growthRate));

  const delta = Math.round(city.population_total * growthRate);
  const newPop = Math.max(POP_MIN, city.population_total + delta);

  // Stability drift toward baseline
  let newStability = stability;
  if (opts.hasRebellion) {
    newStability -= 3;
  } else {
    if (newStability > STABILITY_BASELINE) newStability -= 1;
    else if (newStability < STABILITY_BASELINE) newStability += 1;
  }
  newStability = Math.max(0, Math.min(100, newStability));

  // Development level milestones
  let newDev = city.development_level || 1;
  for (const { pop, level } of DEV_THRESHOLDS) {
    if (newPop > pop && newDev < level) newDev = level;
  }

  return {
    cityId: city.id, cityName: city.name,
    oldPop: city.population_total, newPop, delta,
    newDev, newStability,
  };
}

/**
 * Compute population layer distribution preserving ratios.
 */
export function distributePopLayers(
  newPop: number,
  oldTotal: number,
  oldPeasants: number,
  oldBurghers: number,
  oldClerics: number
): { peasants: number; burghers: number; clerics: number } {
  const total = Math.max(1, oldTotal);
  const peasants = Math.round(newPop * (oldPeasants / total));
  const burghers = Math.round(newPop * (oldBurghers / total));
  const clerics = newPop - peasants - burghers;
  return { peasants, burghers, clerics: Math.max(0, clerics) };
}

// ═══════════════════════════════════════════
// INFLUENCE CALCULATION
// ═══════════════════════════════════════════

export interface InfluenceInput {
  playerName: string;
  cities: Array<{ owner_player: string; status?: string; population_burghers?: number; city_stability?: number }>;
  stacks: Array<{ player_name: string; power?: number }>;
  laws: Array<{ player_name: string }>;
  provinces: Array<{ owner_player: string }>;
  treaties: Array<{ player: string; note?: string; event_type?: string }>;
  previousReputation: number;
}

export interface InfluenceResult {
  player_name: string;
  military_score: number;
  trade_score: number;
  diplomatic_score: number;
  territorial_score: number;
  law_stability_score: number;
  reputation_score: number;
  total_influence: number;
}

export function computeInfluence(input: InfluenceInput): InfluenceResult {
  const myCities = input.cities.filter(c => c.owner_player === input.playerName);
  const myStacks = input.stacks.filter(s => s.player_name === input.playerName);
  const myLaws = input.laws.filter(l => l.player_name === input.playerName);
  const myProvinces = input.provinces.filter(p => p.owner_player === input.playerName);

  const militaryScore = myStacks.reduce((s, st) => s + (st.power || 0), 0);
  const tradeScore = myCities.reduce((s, c) => s + (c.population_burghers || 0), 0);

  const diplomaticEvents = input.treaties.filter(e =>
    e.player === input.playerName || (e.note && e.note.includes(input.playerName))
  );
  const diplomaticScore = diplomaticEvents.length * 10;

  const territorialScore = myProvinces.length * 20 + myCities.length * 10;

  const avgStability = myCities.length > 0
    ? myCities.reduce((s, c) => s + (c.city_stability || 70), 0) / myCities.length
    : 50;
  const lawStabilityScore = myLaws.length * 5 + avgStability * 0.5;

  const reputationScore = input.previousReputation * REPUTATION_DECAY;

  const totalInfluence =
    militaryScore * 0.25 +
    tradeScore * 0.2 +
    diplomaticScore * 0.15 +
    territorialScore * 0.2 +
    lawStabilityScore * 0.1 +
    reputationScore * 0.1;

  return {
    player_name: input.playerName,
    military_score: Math.round(militaryScore),
    trade_score: Math.round(tradeScore),
    diplomatic_score: Math.round(diplomaticScore),
    territorial_score: Math.round(territorialScore),
    law_stability_score: Math.round(lawStabilityScore * 10) / 10,
    reputation_score: Math.round(reputationScore * 10) / 10,
    total_influence: Math.round(totalInfluence * 10) / 10,
  };
}

// ═══════════════════════════════════════════
// TENSION CALCULATION
// ═══════════════════════════════════════════

export interface TensionInput {
  sessionId: string;
  turnNumber: number;
  playerA: string;
  playerB: string;
  citiesA: Array<{ province_id?: string }>;
  citiesB: Array<{ province_id?: string }>;
  militaryScoreA: number;
  militaryScoreB: number;
  brokenTreatyCount: number;
  embargoCount: number;
  tradeImbalance?: number;
}

export interface TensionResult {
  player_a: string;
  player_b: string;
  border_proximity: number;
  military_diff: number;
  broken_treaties: number;
  trade_embargo: number;
  total_tension: number;
  crisis_triggered: boolean;
  war_roll_triggered: boolean;
  war_roll_result: number | null;
}

export function computeTension(input: TensionInput): TensionResult {
  // Border proximity: shared provinces
  const provIdsA = new Set(input.citiesA.map(c => c.province_id).filter(Boolean));
  const provIdsB = new Set(input.citiesB.map(c => c.province_id).filter(Boolean));
  const sharedProvs = [...provIdsA].filter(id => provIdsB.has(id));
  const borderProximity = sharedProvs.length * 15 + Math.min(provIdsA.size, provIdsB.size) * 2;

  const militaryDiff = Math.abs(input.militaryScoreA - input.militaryScoreB) * 0.1;
  const brokenTreaties = input.brokenTreatyCount * 20;
  const tradeEmbargo = input.embargoCount * 15;
  const tradeImbalance = (input.tradeImbalance || 0) * 0.05;

  const totalTension = borderProximity + militaryDiff + brokenTreaties + tradeEmbargo + tradeImbalance;
  const crisisTriggered = totalTension >= CRISIS_THRESHOLD;
  const warRollTriggered = totalTension >= WAR_THRESHOLD;

  let warRollResult: number | null = null;
  if (warRollTriggered) {
    const seed = input.turnNumber * 31 + input.playerA.length * 7 + input.playerB.length * 13;
    warRollResult = (seed % 100) / 100;
  }

  return {
    player_a: input.playerA,
    player_b: input.playerB,
    border_proximity: borderProximity,
    military_diff: Math.round(militaryDiff * 10) / 10,
    broken_treaties: brokenTreaties,
    trade_embargo: tradeEmbargo,
    total_tension: Math.round(totalTension * 10) / 10,
    crisis_triggered: crisisTriggered,
    war_roll_triggered: warRollTriggered,
    war_roll_result: warRollResult,
  };
}

// ═══════════════════════════════════════════
// REBELLION EVALUATION
// ═══════════════════════════════════════════

export interface RebellionResult {
  cityId: string;
  cityName: string;
  owner: string;
  stability: number;
  rebelled: boolean;
  popLoss: number;
  newStability: number;
}

export function evaluateRebellion(
  city: { id: string; name: string; owner_player: string; city_stability: number; population_total: number; status: string },
  turnNumber: number,
  seedOffset = 0
): RebellionResult | null {
  if (city.status !== "ok") return null;
  const stability = city.city_stability || 70;
  if (stability >= REBELLION_STABILITY_THRESHOLD) return null;

  const rebelSeed = turnNumber * 23 + city.name.length * 7 + seedOffset;
  const rebelRoll = (rebelSeed % 100) / 100;
  const rebelThreshold = stability < REBELLION_SEVERE_THRESHOLD
    ? REBELLION_ROLL_THRESHOLD_SEVERE
    : REBELLION_ROLL_THRESHOLD_NORMAL;

  if (rebelRoll >= rebelThreshold) {
    return {
      cityId: city.id, cityName: city.name, owner: city.owner_player,
      stability, rebelled: false, popLoss: 0, newStability: stability,
    };
  }

  const popLoss = Math.round(city.population_total * REBELLION_POP_LOSS_RATE);
  const newStability = Math.max(5, stability - REBELLION_STABILITY_LOSS);

  return {
    cityId: city.id, cityName: city.name, owner: city.owner_player,
    stability, rebelled: true, popLoss, newStability,
  };
}

// ═══════════════════════════════════════════
// REPUTATION HELPERS
// ═══════════════════════════════════════════

export const REPUTATION_DELTAS = {
  alliance: 10,
  treaty: 5,
  betrayal: -25,
  crisis_participant: -5,
  war_aggressor: -15,
  war_defender: -10,
  rebellion_owner: -8,
  treaty_break: -10,
} as const;

export function clampReputation(value: number): number {
  return Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, value));
}
