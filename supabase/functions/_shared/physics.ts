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
// SETTLEMENT LEVEL PROGRESSION
// ═══════════════════════════════════════════

/** Population thresholds for automatic settlement level upgrades */
export const SETTLEMENT_LEVEL_THRESHOLDS: Array<{ minPop: number; level: string; label: string; maxSlots: number; maxDistricts: number; housingCapacity: number }> = [
  { minPop: 0,     level: "HAMLET",   label: "Osada",     maxSlots: 3,  maxDistricts: 2,  housingCapacity: 500 },
  { minPop: 2000,  level: "TOWNSHIP", label: "Městečko",  maxSlots: 5,  maxDistricts: 4,  housingCapacity: 1200 },
  { minPop: 5000,  level: "CITY",     label: "Město",     maxSlots: 8,  maxDistricts: 6,  housingCapacity: 3000 },
  { minPop: 10000, level: "POLIS",    label: "Polis",     maxSlots: 12, maxDistricts: 10, housingCapacity: 8000 },
];

/** Determine the correct settlement level for a given population */
export function getSettlementLevelForPop(pop: number): typeof SETTLEMENT_LEVEL_THRESHOLDS[0] {
  let result = SETTLEMENT_LEVEL_THRESHOLDS[0];
  for (const tier of SETTLEMENT_LEVEL_THRESHOLDS) {
    if (pop >= tier.minPop) result = tier;
  }
  return result;
}

/** Get the next settlement tier (or null if already max) */
export function getNextSettlementTier(currentLevel: string): typeof SETTLEMENT_LEVEL_THRESHOLDS[0] | null {
  const idx = SETTLEMENT_LEVEL_THRESHOLDS.findIndex(t => t.level === currentLevel);
  if (idx < 0 || idx >= SETTLEMENT_LEVEL_THRESHOLDS.length - 1) return null;
  return SETTLEMENT_LEVEL_THRESHOLDS[idx + 1];
}

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
  settlement_level?: string;
}

export interface GrowthResult {
  cityId: string;
  cityName: string;
  oldPop: number;
  newPop: number;
  delta: number;
  newDev: number;
  newStability: number;
  /** If settlement level changed, contains old and new level */
  settlementUpgrade?: { oldLevel: string; newLevel: string; newLabel: string; newMaxSlots: number; newMaxDistricts: number; newHousingCapacity: number };
}

export function computeSettlementGrowth(
  city: CityForGrowth,
  opts: { hasRebellion?: boolean; hasTrade?: boolean; openBordersBonuses?: { birth_rate_bonus?: number; migration_bonus?: number } } = {}
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
  const openBordersBirthBonus = opts.openBordersBonuses?.birth_rate_bonus || 0;
  const openBordersMigrationBonus = opts.openBordersBonuses?.migration_bonus || 0;
  
  let growthRate = POP_GROWTH_BASE + stabilityFactor + famineFactor + warFactor + tradeFactor + openBordersBirthBonus + openBordersMigrationBonus;
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

  // Settlement level auto-upgrade
  let settlementUpgrade: GrowthResult["settlementUpgrade"] = undefined;
  const currentLevel = city.settlement_level || "HAMLET";
  const correctTier = getSettlementLevelForPop(newPop);
  if (correctTier.level !== currentLevel) {
    const currentIdx = SETTLEMENT_LEVEL_THRESHOLDS.findIndex(t => t.level === currentLevel);
    const newIdx = SETTLEMENT_LEVEL_THRESHOLDS.findIndex(t => t.level === correctTier.level);
    // Only upgrade (never downgrade)
    if (newIdx > currentIdx) {
      settlementUpgrade = {
        oldLevel: currentLevel,
        newLevel: correctTier.level,
        newLabel: correctTier.label,
        newMaxSlots: correctTier.maxSlots,
        newMaxDistricts: correctTier.maxDistricts,
        newHousingCapacity: correctTier.housingCapacity,
      };
    }
  }

  return {
    cityId: city.id, cityName: city.name,
    oldPop: city.population_total, newPop, delta,
    newDev, newStability, settlementUpgrade,
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
  oldClerics: number,
  oldWarriors?: number,
): { peasants: number; burghers: number; clerics: number; warriors: number } {
  const total = Math.max(1, oldTotal);
  const warr = oldWarriors || 0;
  const peasants = Math.round(newPop * (oldPeasants / total));
  const burghers = Math.round(newPop * (oldBurghers / total));
  const warriors = Math.round(newPop * (warr / total));
  const clerics = Math.max(0, newPop - peasants - burghers - warriors);
  return { peasants, burghers, clerics, warriors };
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
  /** Cultural score from Games & Academies — medals, hosting, academy reputation */
  culturalData?: { totalMedals: number; goldMedals: number; hostingCount: number; avgAcademyReputation: number };
  /** Typed prestige from realm_resources */
  prestigeData?: { military_prestige: number; economic_prestige: number; cultural_prestige: number };
}

export interface InfluenceResult {
  player_name: string;
  military_score: number;
  trade_score: number;
  diplomatic_score: number;
  territorial_score: number;
  law_stability_score: number;
  reputation_score: number;
  cultural_score: number;
  total_influence: number;
}

export function computeInfluence(input: InfluenceInput): InfluenceResult {
  const myCities = input.cities.filter(c => c.owner_player === input.playerName);
  const myStacks = input.stacks.filter(s => s.player_name === input.playerName);
  const myLaws = input.laws.filter(l => l.player_name === input.playerName);
  const myProvinces = input.provinces.filter(p => p.owner_player === input.playerName);

  // Typed prestige amplifies existing scores
  const pd = input.prestigeData || { military_prestige: 0, economic_prestige: 0, cultural_prestige: 0 };
  const milPrestigeMult = 1 + Math.min(pd.military_prestige, 200) * 0.002; // up to +40%
  const ecoPrestigeMult = 1 + Math.min(pd.economic_prestige, 200) * 0.002;

  const militaryScore = myStacks.reduce((s, st) => s + (st.power || 0), 0) * milPrestigeMult;
  const tradeScore = myCities.reduce((s, c) => s + (c.population_burghers || 0), 0) * ecoPrestigeMult;

  const diplomaticEvents = input.treaties.filter(e =>
    e.player === input.playerName || (e.note && e.note.includes(input.playerName))
  );
  // Total prestige reduces diplomatic friction (more prestige = more diplomatic weight)
  const totalPrestige = pd.military_prestige + pd.economic_prestige + pd.cultural_prestige;
  const diplomaticScore = diplomaticEvents.length * 10 + Math.min(totalPrestige, 300) * 0.1;

  const territorialScore = myProvinces.length * 20 + myCities.length * 10;

  const avgStability = myCities.length > 0
    ? myCities.reduce((s, c) => s + (c.city_stability || 70), 0) / myCities.length
    : 50;
  const lawStabilityScore = myLaws.length * 5 + avgStability * 0.5;

  const reputationScore = input.previousReputation * REPUTATION_DECAY;

  // Cultural score: medals + hosting + academy rep + cultural_prestige
  const cd = input.culturalData || { totalMedals: 0, goldMedals: 0, hostingCount: 0, avgAcademyReputation: 0 };
  const culturalScore = cd.goldMedals * 3 + (cd.totalMedals - cd.goldMedals) * 1.5 + cd.hostingCount * 15 + cd.avgAcademyReputation * 0.3 + pd.cultural_prestige * 0.5;

  const totalInfluence =
    militaryScore * 0.22 +
    tradeScore * 0.18 +
    diplomaticScore * 0.13 +
    territorialScore * 0.18 +
    lawStabilityScore * 0.09 +
    reputationScore * 0.10 +
    culturalScore * 0.10;

  return {
    player_name: input.playerName,
    military_score: Math.round(militaryScore),
    trade_score: Math.round(tradeScore),
    diplomatic_score: Math.round(diplomaticScore),
    territorial_score: Math.round(territorialScore),
    law_stability_score: Math.round(lawStabilityScore * 10) / 10,
    reputation_score: Math.round(reputationScore * 10) / 10,
    cultural_score: Math.round(culturalScore * 10) / 10,
    total_influence: Math.round(totalInfluence * 10) / 10,
  };
}

// ═══════════════════════════════════════════
// PRESTIGE GAMEPLAY EFFECTS
// Used by process-turn to apply bonuses from typed prestige
// ═══════════════════════════════════════════

export interface PrestigeEffects {
  /** Military prestige: morale bonus for new units, recruit cost discount % */
  moraleBonus: number;
  recruitDiscount: number;
  /** Economic prestige: trade income multiplier, build cost discount % */
  tradeMultiplier: number;
  buildDiscount: number;
  /** Cultural prestige: stability bonus, population growth modifier */
  stabilityBonus: number;
  popGrowthBonus: number;
  /** Total prestige: tension reduction factor */
  tensionReduction: number;
}

export function computePrestigeEffects(mil: number, eco: number, cul: number): PrestigeEffects {
  return {
    moraleBonus: Math.min(15, Math.floor(mil / 10)),        // +1 morale per 10 mil prestige, cap 15
    recruitDiscount: Math.min(0.20, mil * 0.001),            // up to 20% recruit cost reduction
    tradeMultiplier: 1 + Math.min(0.30, eco * 0.0015),      // up to +30% trade income
    buildDiscount: Math.min(0.15, eco * 0.001),              // up to 15% build cost reduction
    stabilityBonus: Math.min(10, Math.floor(cul / 10)),      // +1 stability drift per 10 cul prestige, cap 10
    popGrowthBonus: Math.min(0.01, cul * 0.00005),           // up to +1% pop growth
    tensionReduction: Math.min(15, (mil + eco + cul) * 0.03), // total prestige reduces tension, cap 15
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
  /** Total prestige of both players — reduces tension via diplomatic weight */
  totalPrestigeA?: number;
  totalPrestigeB?: number;
}

export interface TensionResult {
  player_a: string;
  player_b: string;
  border_proximity: number;
  military_diff: number;
  broken_treaties: number;
  trade_embargo: number;
  prestige_reduction: number;
  total_tension: number;
  crisis_triggered: boolean;
  war_roll_triggered: boolean;
  war_roll_result: number | null;
}

export function computeTension(input: TensionInput): TensionResult {
  const provIdsA = new Set(input.citiesA.map(c => c.province_id).filter(Boolean));
  const provIdsB = new Set(input.citiesB.map(c => c.province_id).filter(Boolean));
  const sharedProvs = [...provIdsA].filter(id => provIdsB.has(id));
  const borderProximity = sharedProvs.length * 15 + Math.min(provIdsA.size, provIdsB.size) * 2;

  const militaryDiff = Math.abs(input.militaryScoreA - input.militaryScoreB) * 0.1;
  const brokenTreaties = input.brokenTreatyCount * 20;
  const tradeEmbargo = input.embargoCount * 15;
  const tradeImbalance = (input.tradeImbalance || 0) * 0.05;

  // Prestige reduces tension — higher combined prestige = more diplomatic stability
  const combinedPrestige = (input.totalPrestigeA || 0) + (input.totalPrestigeB || 0);
  const prestigeReduction = Math.min(15, combinedPrestige * 0.02);

  const rawTension = borderProximity + militaryDiff + brokenTreaties + tradeEmbargo + tradeImbalance;
  const totalTension = Math.max(0, rawTension - prestigeReduction);
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
    prestige_reduction: Math.round(prestigeReduction * 10) / 10,
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

// ═══════════════════════════════════════════
// CIV DNA → STRUCTURED BONUSES
// ═══════════════════════════════════════════

/**
 * Bonus pool: deterministic assignment based on text hash.
 * Each civ gets 2-3 bonuses from each text field.
 */
const QUIRK_BONUS_POOL: Array<{ key: string; value: number; keywords: string[] }> = [
  { key: "stability_modifier", value: 5, keywords: ["shromáždění", "rada", "moudrost", "tradice", "řád"] },
  { key: "diplomacy_modifier", value: 8, keywords: ["obchod", "vyjednávání", "diplomacie", "smír", "mír"] },
  { key: "trade_modifier", value: 0.1, keywords: ["trh", "kupec", "zlato", "bohatství", "prosperita"] },
  { key: "growth_modifier", value: 0.005, keywords: ["plodnost", "rodina", "přírůstek", "osídlení", "lid"] },
  { key: "morale_modifier", value: 5, keywords: ["odvaha", "válečník", "čest", "sláva", "boj"] },
];

const ARCH_BONUS_POOL: Array<{ key: string; value: number; keywords: string[] }> = [
  { key: "fortification_bonus", value: 0.1, keywords: ["hradby", "věže", "pevnost", "obrana", "robustní"] },
  { key: "build_speed_modifier", value: -0.15, keywords: ["rychl", "lehk", "dřev", "jednoduch", "funkční"] },
  { key: "stability_modifier", value: 3, keywords: ["chrám", "katedrál", "posvát", "víra", "mramor"] },
  { key: "trade_modifier", value: 0.08, keywords: ["přístav", "most", "cest", "bráně", "tržiště"] },
];

const MYTH_BONUS_POOL: Array<{ key: string; value: number; keywords: string[] }> = [
  { key: "legitimacy_base", value: 10, keywords: ["král", "dynastie", "dědic", "koruna", "právo"] },
  { key: "morale_modifier", value: 5, keywords: ["vytrvalost", "síla", "přežití", "oheň", "krev"] },
  { key: "growth_modifier", value: 0.003, keywords: ["země", "úroda", "požehnání", "bohové", "příroda"] },
  { key: "diplomacy_modifier", value: 5, keywords: ["jednota", "spojenectví", "spravedlnost", "zákon", "smlouva"] },
  { key: "stability_modifier", value: 4, keywords: ["rozhodnutí", "moudrost", "stopa", "postupn", "vytrval"] },
];

/**
 * Derive structured bonuses from free-text civ DNA fields.
 * Uses keyword matching + deterministic hash fallback.
 */
export function deriveCivBonuses(
  coreMíth: string | null,
  culturalQuirk: string | null,
  architecturalStyle: string | null
): Record<string, number> {
  const bonuses: Record<string, number> = {};

  function applyPool(text: string | null, pool: typeof QUIRK_BONUS_POOL) {
    if (!text) return;
    const lower = text.toLowerCase();
    let matched = false;
    for (const entry of pool) {
      if (entry.keywords.some(kw => lower.includes(kw))) {
        bonuses[entry.key] = (bonuses[entry.key] || 0) + entry.value;
        matched = true;
      }
    }
    // Fallback: if no keyword matched, assign first bonus based on text hash
    if (!matched && text.length > 0) {
      let h = 0;
      for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
      const idx = Math.abs(h) % pool.length;
      bonuses[pool[idx].key] = (bonuses[pool[idx].key] || 0) + pool[idx].value;
    }
  }

  applyPool(culturalQuirk, QUIRK_BONUS_POOL);
  applyPool(architecturalStyle, ARCH_BONUS_POOL);
  applyPool(coreMíth, MYTH_BONUS_POOL);

  return bonuses;
}

// ═══════════════════════════════════════════
// TRAIT → ENGINE MODIFIERS
// ═══════════════════════════════════════════

export const TRAIT_INTENSITY_THRESHOLD = 3; // Only traits with intensity >= this affect engine
export const TRAIT_DECAY_PER_TURN = 1; // Intensity reduction per turn without reinforcement
export const TRAIT_DECAY_GRACE_TURNS = 5; // Turns before decay starts

/**
 * Trait categories and their mechanical effects on tension between two players.
 * Returns additional tension points.
 */
export function computeTraitTensionModifier(
  traitsA: Array<{ trait_category: string; trait_text: string; intensity: number; entity_name: string }>,
  traitsB: Array<{ trait_category: string; trait_text: string; intensity: number; entity_name: string }>,
  playerA: string,
  playerB: string
): number {
  let modifier = 0;

  // "Vztah" (relationship) traits mentioning the other player
  for (const t of traitsA) {
    if (t.intensity < TRAIT_INTENSITY_THRESHOLD) continue;
    const lower = t.trait_text.toLowerCase();
    const mentionsB = lower.includes(playerB.toLowerCase());
    if (!mentionsB) continue;

    if (t.trait_category === "Vztah" || t.trait_category === "relationship") {
      // Hostile relationships increase tension
      if (lower.includes("válčí") || lower.includes("nepřítel") || lower.includes("rival")) {
        modifier += t.intensity * 3;
      }
      // Friendly relationships decrease tension
      if (lower.includes("spojenec") || lower.includes("přítel") || lower.includes("obchod")) {
        modifier -= t.intensity * 2;
      }
    }
  }

  // Same for B's traits about A
  for (const t of traitsB) {
    if (t.intensity < TRAIT_INTENSITY_THRESHOLD) continue;
    const lower = t.trait_text.toLowerCase();
    const mentionsA = lower.includes(playerA.toLowerCase());
    if (!mentionsA) continue;

    if (t.trait_category === "Vztah" || t.trait_category === "relationship") {
      if (lower.includes("válčí") || lower.includes("nepřítel") || lower.includes("rival")) {
        modifier += t.intensity * 3;
      }
      if (lower.includes("spojenec") || lower.includes("přítel") || lower.includes("obchod")) {
        modifier -= t.intensity * 2;
      }
    }
  }

  // "Pověst" (reputation) traits affect general tension
  for (const t of [...traitsA, ...traitsB]) {
    if (t.intensity < TRAIT_INTENSITY_THRESHOLD) continue;
    if (t.trait_category !== "Pověst" && t.trait_category !== "reputation") continue;
    const lower = t.trait_text.toLowerCase();
    if (lower.includes("hrozba") || lower.includes("agresivní") || lower.includes("krutý")) {
      modifier += t.intensity * 1.5;
    }
    if (lower.includes("mírumilovný") || lower.includes("spravedlivý") || lower.includes("důvěryhodný")) {
      modifier -= t.intensity * 1;
    }
  }

  return Math.round(modifier * 10) / 10;
}

/**
 * Trait-based influence modifier for a player.
 * Returns additional influence points.
 */
export function computeTraitInfluenceModifier(
  traits: Array<{ trait_category: string; trait_text: string; intensity: number }>
): { diplomatic: number; military: number; trade: number; reputation: number } {
  const mods = { diplomatic: 0, military: 0, trade: 0, reputation: 0 };

  for (const t of traits) {
    if (t.intensity < TRAIT_INTENSITY_THRESHOLD) continue;
    const lower = t.trait_text.toLowerCase();

    if (t.trait_category === "Pověst" || t.trait_category === "reputation") {
      if (lower.includes("hrozba") || lower.includes("obávaný")) {
        mods.military += t.intensity * 2;
        mods.reputation -= t.intensity * 1;
      }
      if (lower.includes("respektovaný") || lower.includes("důvěryhodný")) {
        mods.diplomatic += t.intensity * 3;
        mods.reputation += t.intensity * 2;
      }
    }

    if (t.trait_category === "Titul" || t.trait_category === "title") {
      mods.reputation += t.intensity * 1.5;
    }

    if (t.trait_category === "Historický fakt" || t.trait_category === "historical_fact") {
      if (lower.includes("obchod") || lower.includes("bohatství")) mods.trade += t.intensity * 2;
      if (lower.includes("válka") || lower.includes("dobytí")) mods.military += t.intensity * 2;
      if (lower.includes("růst") || lower.includes("populace")) mods.trade += t.intensity * 1;
    }
  }

  return {
    diplomatic: Math.round(mods.diplomatic),
    military: Math.round(mods.military),
    trade: Math.round(mods.trade),
    reputation: Math.round(mods.reputation * 10) / 10,
  };
}

/**
 * Evaluate myth alignment: do recent traits reinforce or contradict the core myth?
 * Returns legitimacy delta (-10 to +10).
 */
export function evaluateMythAlignment(
  coreMíth: string | null,
  recentTraits: Array<{ trait_text: string; trait_category: string; intensity: number }>,
  recentEvents: Array<{ event_type: string; note?: string | null }>
): number {
  if (!coreMíth || coreMíth.length < 10) return 0;
  const mythLower = coreMíth.toLowerCase();

  // Extract key theme words from myth (words > 4 chars)
  const mythWords = mythLower
    .split(/\s+/)
    .filter(w => w.length > 4)
    .map(w => w.replace(/[^a-záčďéěíňóřšťúůýž]/gi, ""));

  if (mythWords.length === 0) return 0;

  let alignment = 0;

  // Check if recent traits echo myth themes
  for (const t of recentTraits) {
    const traitLower = t.trait_text.toLowerCase();
    const matches = mythWords.filter(w => traitLower.includes(w)).length;
    if (matches > 0) alignment += Math.min(matches, 3) * t.intensity * 0.5;
  }

  // Check if recent events echo myth themes
  for (const e of recentEvents) {
    const noteLower = (e.note || "").toLowerCase();
    const matches = mythWords.filter(w => noteLower.includes(w)).length;
    if (matches > 0) alignment += Math.min(matches, 2);
  }

  // Contradiction: betrayal events when myth mentions trust/honor
  const mythValuesTrust = mythWords.some(w =>
    ["věrnost", "čest", "spravedlnost", "důvěra", "vytrvalost"].some(v => w.includes(v))
  );
  if (mythValuesTrust) {
    const betrayals = recentEvents.filter(e => e.event_type === "betrayal").length;
    alignment -= betrayals * 5;
  }

  return Math.max(-10, Math.min(10, Math.round(alignment)));
}

// ═══════════════════════════════════════════
// CIV IDENTITY → MECHANICAL MODIFIERS
// ═══════════════════════════════════════════

export interface CivIdentity {
  culture_tags: string[];
  urban_style: string;
  society_structure: string;
  military_doctrine: string;
  economic_focus: string;
  grain_modifier: number;
  wood_modifier: number;
  stone_modifier: number;
  iron_modifier: number;
  wealth_modifier: number;
  production_modifier: number;
  trade_modifier: number;
  stability_modifier: number;
  morale_modifier: number;
  mobilization_speed: number;
  pop_growth_modifier: number;
  initial_burgher_ratio: number;
  initial_cleric_ratio: number;
  cavalry_bonus: number;
  fortification_bonus: number;
  building_tags: string[];
  display_name: string | null;
  flavor_summary: string | null;
}

/**
 * Apply civ_identity modifiers to settlement growth calculation.
 * Returns adjusted growth rate delta and stability delta.
 */
export function applyCivIdentityToGrowth(
  identity: CivIdentity | null,
  baseGrowthRate: number,
  baseStability: number,
): { growthRate: number; stabilityDelta: number; moraleDelta: number } {
  if (!identity) return { growthRate: baseGrowthRate, stabilityDelta: 0, moraleDelta: 0 };

  let growthRate = baseGrowthRate + identity.grain_modifier;
  growthRate = Math.max(POP_GROWTH_MIN, Math.min(POP_GROWTH_MAX, growthRate));

  return {
    growthRate,
    stabilityDelta: identity.stability_modifier,
    moraleDelta: identity.morale_modifier,
  };
}

/**
 * Apply civ_identity to influence calculation.
 * Returns additive modifiers per influence category.
 */
export function applyCivIdentityToInfluence(
  identity: CivIdentity | null,
): { trade: number; military: number; diplomatic: number } {
  if (!identity) return { trade: 0, military: 0, diplomatic: 0 };

  let trade = identity.trade_modifier * 100; // scale to influence points
  let military = 0;
  let diplomatic = (identity as any).diplomacy_modifier || 0;

  // Military doctrine affects military influence
  if (identity.military_doctrine === "offensive") military += 15;
  if (identity.military_doctrine === "conscript") military += 10;
  if (identity.military_doctrine === "naval") { military += 5; trade += 10; }
  if (identity.military_doctrine === "mercenary") { military += 8; trade += 5; }

  // Society structure affects diplomatic influence
  if (identity.society_structure === "mercantile") { trade += 15; diplomatic += 5; }
  if (identity.society_structure === "theocratic") diplomatic += 10;
  if (identity.society_structure === "feudal") military += 5;
  if (identity.society_structure === "egalitarian") diplomatic += 8;

  // Economic focus
  if (identity.economic_focus === "trade") trade += 20;
  if (identity.economic_focus === "mining") trade += 5;
  if (identity.economic_focus === "raiding") { military += 10; diplomatic -= 5; }

  return {
    trade: Math.round(trade),
    military: Math.round(military),
    diplomatic: Math.round(diplomatic),
  };
}

// ═══════════════════════════════════════════
// STRUCTURAL CATEGORY → MECHANICAL BONUSES
// ═══════════════════════════════════════════

export interface StructuralBonuses {
  // City-level bonuses
  building_cost_mult: number;       // multiplier on building costs (< 1 = cheaper)
  building_speed_mult: number;      // multiplier on build duration (< 1 = faster)
  housing_capacity_mult: number;    // multiplier on housing capacity
  defense_bonus: number;            // additive to city defense
  grain_production_mult: number;    // multiplier on grain production
  wealth_production_mult: number;   // multiplier on wealth/trade income
  stone_production_mult: number;    // multiplier on stone production
  iron_production_mult: number;     // multiplier on iron production
  wood_production_mult: number;     // multiplier on wood production
  // Pop / stability
  pop_growth_bonus: number;         // additive to growth rate
  stability_bonus: number;          // additive to stability
  legitimacy_bonus: number;         // additive per-turn legitimacy drift
  burgher_ratio_bonus: number;      // additive shift to burgher ratio
  cleric_ratio_bonus: number;       // additive shift to cleric ratio
  // Military
  recruitment_speed_mult: number;   // multiplier on recruitment time
  morale_bonus: number;             // additive to army morale
  siege_bonus: number;              // additive to siege power
}

const DEFAULT_STRUCTURAL: StructuralBonuses = {
  building_cost_mult: 1, building_speed_mult: 1, housing_capacity_mult: 1,
  defense_bonus: 0, grain_production_mult: 1, wealth_production_mult: 1,
  stone_production_mult: 1, iron_production_mult: 1, wood_production_mult: 1,
  pop_growth_bonus: 0, stability_bonus: 0, legitimacy_bonus: 0,
  burgher_ratio_bonus: 0, cleric_ratio_bonus: 0,
  recruitment_speed_mult: 1, morale_bonus: 0, siege_bonus: 0,
};

/**
 * Compute mechanical bonuses from the 4 structural categories.
 * These stack additively with numeric civ_identity modifiers.
 */
export function computeStructuralBonuses(identity: CivIdentity | null): StructuralBonuses {
  if (!identity) return { ...DEFAULT_STRUCTURAL };
  const b = { ...DEFAULT_STRUCTURAL };

  // ── URBAN STYLE ──
  switch (identity.urban_style) {
    case "organic":
      b.building_cost_mult *= 0.85;      // 15% cheaper buildings
      b.building_speed_mult *= 0.9;      // 10% faster
      b.housing_capacity_mult *= 0.9;    // slightly less organized housing
      break;
    case "planned":
      b.building_cost_mult *= 1.1;       // 10% more expensive (planning overhead)
      b.grain_production_mult *= 1.1;    // 10% more efficient farms
      b.wealth_production_mult *= 1.1;   // organized markets
      b.housing_capacity_mult *= 1.15;   // better housing layouts
      b.stability_bonus += 3;            // order from planning
      break;
    case "fortified":
      b.building_cost_mult *= 1.2;       // 20% more expensive (thick walls)
      b.defense_bonus += 15;             // strong city defense
      b.stone_production_mult *= 1.15;   // stonework expertise
      b.siege_bonus += 5;                // siege engineering knowledge
      break;
    case "scattered":
      b.building_cost_mult *= 0.7;       // 30% cheaper (simple structures)
      b.building_speed_mult *= 0.75;     // 25% faster to build
      b.defense_bonus -= 10;             // hard to defend scattered settlements
      b.pop_growth_bonus += 0.005;       // flexible growth
      break;
    case "coastal":
      b.wealth_production_mult *= 1.2;   // sea trade bonus
      b.grain_production_mult *= 1.05;   // fishing
      b.wood_production_mult *= 0.9;     // less forests near coast
      b.housing_capacity_mult *= 1.1;    // port infrastructure
      break;
    case "underground":
      b.defense_bonus += 20;             // very defensible
      b.stone_production_mult *= 1.25;   // mining expertise
      b.iron_production_mult *= 1.15;    // deep ore access
      b.grain_production_mult *= 0.85;   // limited farming
      b.housing_capacity_mult *= 0.85;   // cramped underground
      b.pop_growth_bonus -= 0.005;       // slower growth underground
      break;
  }

  // ── SOCIETY STRUCTURE ──
  switch (identity.society_structure) {
    case "tribal":
      b.recruitment_speed_mult *= 0.7;   // 30% faster mobilization
      b.morale_bonus += 3;               // tribal loyalty
      b.stability_bonus -= 3;            // less centralized
      b.building_speed_mult *= 1.1;      // less organized construction
      break;
    case "hierarchical":
      b.stability_bonus += 5;            // strong order
      b.legitimacy_bonus += 2;           // clear authority
      b.building_speed_mult *= 0.9;      // efficient coordination
      b.pop_growth_bonus -= 0.003;       // rigid society slows growth
      break;
    case "egalitarian":
      b.stability_bonus += 3;            // content populace
      b.pop_growth_bonus += 0.005;       // open society attracts settlers
      b.burgher_ratio_bonus += 0.05;     // more middle class
      b.recruitment_speed_mult *= 1.15;  // consensus-based mobilization is slow
      break;
    case "theocratic":
      b.cleric_ratio_bonus += 0.08;      // more clerics
      b.legitimacy_bonus += 3;           // divine mandate
      b.stability_bonus += 4;            // religious order
      b.wealth_production_mult *= 0.9;   // tithing reduces commerce
      break;
    case "feudal":
      b.defense_bonus += 8;              // castle network
      b.recruitment_speed_mult *= 0.85;  // feudal levies are quick
      b.stability_bonus += 2;            // feudal order
      b.burgher_ratio_bonus -= 0.03;     // suppressed merchant class
      break;
    case "mercantile":
      b.wealth_production_mult *= 1.25;  // merchant republic
      b.burgher_ratio_bonus += 0.1;      // dominant merchant class
      b.defense_bonus -= 5;              // profit over walls
      b.recruitment_speed_mult *= 1.2;   // mercenaries take time to hire
      break;
  }

  // ── MILITARY DOCTRINE ──
  switch (identity.military_doctrine) {
    case "defensive":
      b.defense_bonus += 12;
      b.siege_bonus -= 5;               // poor at attacking
      b.building_speed_mult *= 0.9;     // efficient fortification builders
      break;
    case "offensive":
      b.morale_bonus += 5;
      b.siege_bonus += 8;               // siege specialists
      b.defense_bonus -= 5;             // offense-first mentality
      b.recruitment_speed_mult *= 0.9;  // militarized society recruits fast
      break;
    case "guerrilla":
      b.morale_bonus += 3;
      b.defense_bonus += 5;             // hard to root out
      b.recruitment_speed_mult *= 0.8;  // fast irregular recruitment
      b.building_cost_mult *= 0.9;      // resourceful builders
      break;
    case "naval":
      b.wealth_production_mult *= 1.1;  // naval trade
      b.defense_bonus += 3;             // coastal defense
      b.wood_production_mult *= 1.1;    // shipbuilding expertise → woodwork
      break;
    case "mercenary":
      b.recruitment_speed_mult *= 0.75; // instant hire (gold-based)
      b.morale_bonus -= 2;              // less loyal troops
      b.wealth_production_mult *= 1.05; // mercenary economy
      break;
    case "conscript":
      b.recruitment_speed_mult *= 0.6;  // fastest mobilization
      b.morale_bonus -= 3;              // unwilling soldiers
      b.pop_growth_bonus -= 0.003;      // conscription drains population
      b.grain_production_mult *= 0.95;  // workers pulled from fields
      break;
  }

  // ── ECONOMIC FOCUS ──
  switch (identity.economic_focus) {
    case "agrarian":
      b.grain_production_mult *= 1.2;   // farming expertise
      b.pop_growth_bonus += 0.005;      // well-fed populace
      b.stability_bonus += 2;           // self-sufficient
      b.wealth_production_mult *= 0.9;  // less commercial
      break;
    case "trade":
      b.wealth_production_mult *= 1.3;  // trade mastery
      b.burgher_ratio_bonus += 0.05;    // merchant class
      b.grain_production_mult *= 0.9;   // import-dependent
      b.stability_bonus -= 2;           // volatile markets
      break;
    case "mining":
      b.stone_production_mult *= 1.2;
      b.iron_production_mult *= 1.2;
      b.building_cost_mult *= 0.9;      // abundant materials
      b.grain_production_mult *= 0.9;   // miners don't farm
      break;
    case "crafting":
      b.building_cost_mult *= 0.8;      // master craftsmen
      b.building_speed_mult *= 0.85;    // skilled builders
      b.wealth_production_mult *= 1.1;  // artisan goods
      break;
    case "raiding":
      b.morale_bonus += 4;              // warrior spirit
      b.recruitment_speed_mult *= 0.8;  // raid-ready
      b.stability_bonus -= 5;           // chaotic society
      b.wealth_production_mult *= 0.85; // unreliable income
      break;
    case "mixed":
      // No extreme bonuses, slight overall buff
      b.stability_bonus += 2;
      b.grain_production_mult *= 1.05;
      b.wealth_production_mult *= 1.05;
      break;
  }

  return b;
}

/**
 * Get mobilization speed modifier from civ identity.
 * Used by action_queue for military build times.
 */
export function getMobilizationSpeed(identity: CivIdentity | null): number {
  return identity?.mobilization_speed ?? 1.0;
}

// ═══════════════════════════════════════════
// DIPLOMATIC PACT EFFECTS
// ═══════════════════════════════════════════

export interface DiplomaticPact {
  id: string;
  session_id: string;
  party_a: string;
  party_b: string;
  pact_type: string;
  target_party: string | null;
  effects: Record<string, any>;
  status: string;
}

/** Check if an embargo is active between two parties */
export function hasActiveEmbargo(pacts: DiplomaticPact[], playerA: string, playerB: string): boolean {
  return pacts.some(p =>
    p.pact_type === "embargo" && p.status === "active" &&
    ((p.party_a === playerA && p.party_b === playerB) ||
     (p.party_a === playerB && p.party_b === playerA))
  );
}

/** Get active pacts of a specific type involving a player */
export function getActivePacts(pacts: DiplomaticPact[], playerName: string, pactType?: string): DiplomaticPact[] {
  return pacts.filter(p =>
    p.status === "active" &&
    (p.party_a === playerName || p.party_b === playerName) &&
    (!pactType || p.pact_type === pactType)
  );
}

/** Compute aggregated open borders bonuses for a player */
export function getOpenBordersBonuses(pacts: DiplomaticPact[], playerName: string): { birth_rate_bonus: number; migration_bonus: number; trade_efficiency_bonus: number } {
  const openBorders = getActivePacts(pacts, playerName, "open_borders");
  return {
    birth_rate_bonus: openBorders.reduce((sum, p) => sum + (p.effects?.birth_rate_bonus || 0), 0),
    migration_bonus: openBorders.reduce((sum, p) => sum + (p.effects?.migration_bonus || 0), 0),
    trade_efficiency_bonus: openBorders.reduce((sum, p) => sum + (p.effects?.trade_efficiency_bonus || 0), 0),
  };
}

/** Check if a defense pact triggers auto-war */
export function getDefensePactAllies(pacts: DiplomaticPact[], playerName: string): string[] {
  return getActivePacts(pacts, playerName, "defense_pact")
    .map(p => p.party_a === playerName ? p.party_b : p.party_a);
}

/** Compute trade efficiency modifier from pacts (embargo penalty after lifting) */
export function getTradeEfficiencyModifier(pacts: DiplomaticPact[], playerA: string, playerB: string): number {
  let modifier = 0;
  const openBorder = pacts.find(p =>
    p.pact_type === "open_borders" && p.status === "active" &&
    ((p.party_a === playerA && p.party_b === playerB) ||
     (p.party_a === playerB && p.party_b === playerA))
  );
  if (openBorder) modifier += openBorder.effects?.trade_efficiency_bonus || 0.15;

  const pastEmbargo = pacts.find(p =>
    p.pact_type === "embargo" && (p.status === "expired" || p.status === "broken") &&
    ((p.party_a === playerA && p.party_b === playerB) ||
     (p.party_a === playerB && p.party_b === playerA))
  );
  if (pastEmbargo) modifier -= pastEmbargo.effects?.post_embargo_penalty || 0.3;

  return modifier;
}

// ═══════════════════════════════════════════
// PROVINCE CONTROL — node-weighted ownership
// ═══════════════════════════════════════════

export interface NodeControlEntry {
  id: string;
  province_id: string;
  node_type: string;
  strategic_value: number;
  economic_value: number;
  defense_value: number;
  controlled_by: string | null;
}

export interface ProvinceControlResult {
  province_id: string;
  control_player: string | null;
  control_scores: Record<string, number>;
  /** 0-1 dominance ratio of the controlling player */
  dominance: number;
}

/** Weight multipliers for node types in control calculation */
const NODE_CONTROL_WEIGHTS: Record<string, number> = {
  primary_city: 3.0,
  secondary_city: 2.0,
  fortress: 2.5,
  port: 1.5,
  trade_hub: 1.5,
  pass: 2.0,
  resource_node: 1.0,
};

/**
 * Compute province control based on weighted strategic node ownership.
 * A player controls a province if they hold >50% of weighted node value.
 */
export function computeProvinceControl(
  provinceId: string,
  nodes: NodeControlEntry[],
): ProvinceControlResult {
  const provNodes = nodes.filter(n => n.province_id === provinceId);
  if (provNodes.length === 0) {
    return { province_id: provinceId, control_player: null, control_scores: {}, dominance: 0 };
  }

  const scores: Record<string, number> = {};
  let totalWeight = 0;

  for (const node of provNodes) {
    const typeWeight = NODE_CONTROL_WEIGHTS[node.node_type] || 1.0;
    const nodeWeight = typeWeight * (node.strategic_value + node.economic_value * 0.5 + node.defense_value * 0.3);
    totalWeight += nodeWeight;

    if (node.controlled_by) {
      scores[node.controlled_by] = (scores[node.controlled_by] || 0) + nodeWeight;
    }
  }

  if (totalWeight === 0) {
    return { province_id: provinceId, control_player: null, control_scores: scores, dominance: 0 };
  }

  // Find player with highest control score
  let maxPlayer: string | null = null;
  let maxScore = 0;
  for (const [player, score] of Object.entries(scores)) {
    if (score > maxScore) { maxScore = score; maxPlayer = player; }
  }

  const dominance = maxScore / totalWeight;
  // Must have >50% to control
  const controlPlayer = dominance > 0.5 ? maxPlayer : null;

  return { province_id: provinceId, control_player: controlPlayer, control_scores: scores, dominance };
}

// ═══════════════════════════════════════════
// ROUTE TRAVERSAL — advance armies along routes
// ═══════════════════════════════════════════

/**
 * Advance all in-transit stacks by one turn.
 * Called during world-tick / commit-turn.
 * Returns list of arrivals for event generation.
 */
export function computeRouteTraversalProgress(
  stack: { id: string; travel_progress: number; travel_departed_turn: number | null },
  route: { capacity_value: number; route_type: string; metadata?: any; control_state: string },
  currentTurn: number,
): { newProgress: number; arrived: boolean } {
  if (!stack.travel_departed_turn) return { newProgress: 0, arrived: false };

  // Base speed: 1 turn = 50% progress for capacity 5 route
  // Higher capacity = faster traversal
  const baseSpeed = Math.min(1.0, 0.1 * (route.capacity_value || 5));
  const contestedPenalty = route.control_state === "contested" ? 0.5 : 1.0;
  const turnProgress = baseSpeed * contestedPenalty;

  const newProgress = Math.min(1.0, stack.travel_progress + turnProgress);
  return { newProgress, arrived: newProgress >= 1.0 };
}

// ═══════════════════════════════════════════
// ISOLATION PENALTY — hybrid economy model
// ═══════════════════════════════════════════

export interface IsolationInput {
  playerName: string;
  nodes: Array<{ id: string; province_id: string; controlled_by: string | null; node_type: string }>;
  routes: Array<{ node_a: string; node_b: string; control_state: string }>;
}

/**
 * Compute isolation penalty for a player's realm.
 * Measures what fraction of the player's nodes are disconnected from their capital/primary cities.
 * Returns penalty 0-1 (0 = fully connected, 1 = fully isolated).
 */
export function computeIsolationPenalty(input: IsolationInput): { penalty: number; connectedNodes: number; totalNodes: number } {
  const myNodes = input.nodes.filter(n => n.controlled_by === input.playerName);
  if (myNodes.length <= 1) return { penalty: 0, connectedNodes: myNodes.length, totalNodes: myNodes.length };

  const myNodeIds = new Set(myNodes.map(n => n.id));

  // Build adjacency from open/contested routes
  const adj: Record<string, string[]> = {};
  for (const r of input.routes) {
    if (r.control_state === "blocked") continue;
    if (myNodeIds.has(r.node_a) || myNodeIds.has(r.node_b)) {
      if (!adj[r.node_a]) adj[r.node_a] = [];
      if (!adj[r.node_b]) adj[r.node_b] = [];
      adj[r.node_a].push(r.node_b);
      adj[r.node_b].push(r.node_a);
    }
  }

  // BFS from primary city nodes
  const primaryCities = myNodes.filter(n => n.node_type === "primary_city");
  const startNodes = primaryCities.length > 0 ? primaryCities : [myNodes[0]];
  const visited = new Set<string>();
  const queue = startNodes.map(n => n.id);
  for (const id of queue) visited.add(id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of (adj[current] || [])) {
      if (!visited.has(neighbor) && myNodeIds.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const connectedNodes = visited.size;
  const totalNodes = myNodes.length;
  const penalty = totalNodes > 0 ? Math.max(0, 1 - connectedNodes / totalNodes) : 0;

  return { penalty: Math.round(penalty * 100) / 100, connectedNodes, totalNodes };
}

// ═══════════════════════════════════════════
// NODE FLOW COMPUTATION — network economy
// ═══════════════════════════════════════════

export interface FlowNode {
  id: string;
  node_type: string;
  controlled_by: string | null;
  population: number;
  economic_value: number;
  infrastructure_level: number;
  is_major: boolean;
  parent_node_id: string | null;
  city_id: string | null;
  throughput_military: number;
  toll_rate: number;
  cumulative_trade_flow: number;
  urbanization_score: number;
  hinterland_level: number;
  resource_output: Record<string, number>;
  flow_role: string;
}

export interface FlowRoute {
  node_a: string;
  node_b: string;
  capacity_value: number;
  control_state: string;
  damage_level: number;
  speed_value: number;
  safety_value: number;
}

export interface FlowCity {
  id: string;
  last_turn_grain_prod: number;
  last_turn_wood_prod: number;
  last_turn_stone_prod: number;
  last_turn_iron_prod: number;
  development_level: number;
  market_level: number;
}

export interface NodeFlowResult {
  node_id: string;
  grain_production: number;
  wood_production: number;
  stone_production: number;
  iron_production: number;
  wealth_production: number;
  incoming_trade: number;
  outgoing_trade: number;
  incoming_supply: number;
  outgoing_supply: number;
  prosperity_score: number;
  congestion_score: number;
  throughput_score: number;
  isolation_penalty: number;
  toll_income: number;
  trade_flow_delta: number;
  urbanization_delta: number;
}

/** Urbanization thresholds: cumulative trade flow → hinterland level */
export const URBANIZATION_THRESHOLDS: Array<{ level: number; threshold: number; label: string; spawns: string }> = [
  { level: 1, threshold: 200, label: "Vesnice", spawns: "village_cluster" },
  { level: 2, threshold: 800, label: "Dílny", spawns: "resource_node" },
  { level: 3, threshold: 2000, label: "Předměstí", spawns: "trade_hub" },
];

/**
 * Compute flow state for all nodes in a session.
 *
 * NEW MODEL:
 * - Minor nodes REGULATE flow (throughput_military, toll_rate) instead of producing
 * - Minor nodes generate small SUPPORT FLOW to parent major node (resource_output)
 * - Trade flow passing through nodes accumulates urbanization_score
 * - Major nodes + gateway minors auto-grow hinterland based on trade flow
 */
export function computeNodeFlows(
  nodes: FlowNode[],
  routes: FlowRoute[],
  cities: FlowCity[],
): NodeFlowResult[] {
  const cityById = new Map(cities.map(c => [c.id, c]));
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  // Build adjacency with regulation applied
  const adj: Record<string, Array<{ target: string; capacity: number }>> = {};
  for (const r of routes) {
    if (r.control_state === "blocked") continue;
    const effectiveCap = Math.max(1, r.capacity_value - (r.damage_level || 0));
    const safetyMult = r.control_state === "contested" ? 0.5 : r.control_state === "damaged" ? 0.7 : 1.0;

    // Regulator minor nodes reduce throughput on adjacent routes
    const nodeA = nodeById.get(r.node_a);
    const nodeB = nodeById.get(r.node_b);
    let regulationMult = 1.0;
    if (nodeA && !nodeA.is_major && nodeA.flow_role === "regulator") {
      regulationMult *= nodeA.throughput_military;
    }
    if (nodeB && !nodeB.is_major && nodeB.flow_role === "regulator") {
      regulationMult *= nodeB.throughput_military;
    }

    const cap = Math.round(effectiveCap * safetyMult * regulationMult);
    if (!adj[r.node_a]) adj[r.node_a] = [];
    if (!adj[r.node_b]) adj[r.node_b] = [];
    adj[r.node_a].push({ target: r.node_b, capacity: cap });
    adj[r.node_b].push({ target: r.node_a, capacity: cap });
  }

  const results: NodeFlowResult[] = [];

  // Phase 1: Base production — major nodes produce, minor nodes provide support flow
  const production: Record<string, { grain: number; wood: number; stone: number; iron: number; wealth: number }> = {};
  for (const n of nodes) {
    const base = { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 0 };

    if (n.is_major && n.city_id) {
      const city = cityById.get(n.city_id);
      if (city) {
        base.grain = city.last_turn_grain_prod || 0;
        base.wood = city.last_turn_wood_prod || 0;
        base.stone = city.last_turn_stone_prod || 0;
        base.iron = city.last_turn_iron_prod || 0;
        base.wealth = (city.market_level || 0) * 2 + (city.development_level || 0);
      }
    } else if (n.is_major) {
      if (n.node_type === "trade_hub") base.wealth = (n.economic_value || 0) * 2;
      else if (n.node_type === "port") base.wealth = (n.economic_value || 0);
    } else {
      // Minor node: support flow from resource_output (set by urbanization/projects)
      const ro = n.resource_output || {};
      base.grain = ro.grain || 0;
      base.wood = ro.wood || 0;
      base.stone = ro.stone || 0;
      base.iron = ro.iron || 0;
      base.wealth = ro.wealth || 0;
    }

    production[n.id] = base;
  }

  // Phase 2: Minor → Major aggregation (support flow)
  for (const n of nodes) {
    if (n.parent_node_id && !n.is_major) {
      const parent = production[n.parent_node_id];
      const child = production[n.id];
      if (parent && child) {
        parent.grain += child.grain;
        parent.wood += child.wood;
        parent.stone += child.stone;
        parent.iron += child.iron;
        parent.wealth += child.wealth;
      }
    }
  }

  // Phase 3: Route-based trade flow with toll extraction
  const incomingTrade: Record<string, number> = {};
  const outgoingTrade: Record<string, number> = {};
  const incomingSupply: Record<string, number> = {};
  const outgoingSupply: Record<string, number> = {};
  const tollIncome: Record<string, number> = {};
  const tradeFlowThrough: Record<string, number> = {};

  for (const n of nodes) {
    if (!n.is_major) continue;
    const prod = production[n.id];
    if (!prod) continue;

    const totalProd = prod.grain + prod.wood + prod.stone + prod.iron + prod.wealth;
    const neighbors = adj[n.id] || [];

    for (const link of neighbors) {
      const target = nodeById.get(link.target);
      if (!target || !target.is_major) continue;

      let tradeFlow = Math.min(totalProd, link.capacity);

      // Toll extraction by regulator nodes adjacent to endpoints
      const regulatorNodes = nodes.filter(mn =>
        !mn.is_major && mn.flow_role === "regulator" && mn.toll_rate > 0 &&
        (adj[mn.id] || []).some(l => l.target === n.id || l.target === link.target)
      );
      for (const reg of regulatorNodes) {
        const toll = Math.floor(tradeFlow * reg.toll_rate);
        tollIncome[reg.id] = (tollIncome[reg.id] || 0) + toll;
        tradeFlowThrough[reg.id] = (tradeFlowThrough[reg.id] || 0) + tradeFlow;
        tradeFlow -= toll;
      }

      tradeFlowThrough[n.id] = (tradeFlowThrough[n.id] || 0) + tradeFlow;
      tradeFlowThrough[link.target] = (tradeFlowThrough[link.target] || 0) + tradeFlow;

      outgoingTrade[n.id] = (outgoingTrade[n.id] || 0) + tradeFlow;
      incomingTrade[link.target] = (incomingTrade[link.target] || 0) + tradeFlow;

      if (n.controlled_by && n.controlled_by === target.controlled_by) {
        const supplyFlow = Math.min(Math.floor(link.capacity * 0.5), 10);
        outgoingSupply[n.id] = (outgoingSupply[n.id] || 0) + supplyFlow;
        incomingSupply[link.target] = (incomingSupply[link.target] || 0) + supplyFlow;
      }
    }
  }

  // Phase 4: Derived scores + urbanization deltas
  for (const n of nodes) {
    const prod = production[n.id] || { grain: 0, wood: 0, stone: 0, iron: 0, wealth: 0 };
    const inTrade = incomingTrade[n.id] || 0;
    const outTrade = outgoingTrade[n.id] || 0;
    const inSupply = incomingSupply[n.id] || 0;
    const outSupply = outgoingSupply[n.id] || 0;
    const nodeToll = tollIncome[n.id] || 0;
    const nodeTradeThrough = tradeFlowThrough[n.id] || 0;

    const totalFlow = inTrade + outTrade + inSupply + outSupply;
    const neighbors = adj[n.id] || [];
    const totalCapacity = neighbors.reduce((s, l) => s + l.capacity, 0);

    const congestion = totalCapacity > 0 ? Math.min(100, Math.round((totalFlow / totalCapacity) * 100)) : 0;
    const prosperity = Math.min(100, prod.grain + prod.wealth * 2 + inTrade + nodeToll);
    const throughput = totalFlow;
    const isolationPenalty = neighbors.length === 0 && n.is_major ? 50 : 0;

    const urbanizationDelta = (n.is_major || n.flow_role === "gateway")
      ? Math.round(nodeTradeThrough * 0.1)
      : n.flow_role === "regulator"
        ? Math.round(nodeToll * 0.5)
        : 0;

    results.push({
      node_id: n.id,
      grain_production: prod.grain,
      wood_production: prod.wood,
      stone_production: prod.stone,
      iron_production: prod.iron,
      wealth_production: prod.wealth,
      incoming_trade: inTrade,
      outgoing_trade: outTrade,
      incoming_supply: inSupply,
      outgoing_supply: outSupply,
      prosperity_score: prosperity,
      congestion_score: congestion,
      throughput_score: throughput,
      isolation_penalty: isolationPenalty,
      toll_income: nodeToll,
      trade_flow_delta: nodeTradeThrough,
      urbanization_delta: urbanizationDelta,
    });
  }

  return results;
}

// ═══════════════════════════════════════════
// SUPPLY CHAIN COMPUTATION — per-node connectivity
// ═══════════════════════════════════════════

export interface SupplyChainInput {
  playerName: string;
  nodes: Array<{
    id: string;
    node_type: string;
    controlled_by: string | null;
    economic_value: number;
    population: number;
  }>;
  routes: Array<{
    node_a: string;
    node_b: string;
    control_state: string;
    capacity_value: number;
    damage_level: number;
    safety_value: number;
  }>;
  previousState: Array<{
    node_id: string;
    isolation_turns: number;
  }>;
}

export interface SupplyChainResult {
  node_id: string;
  connected_to_capital: boolean;
  isolation_turns: number;
  supply_level: number;
  route_quality: number;
  production_modifier: number;
  stability_modifier: number;
  morale_modifier: number;
  supply_source_node_id: string | null;
  hop_distance: number;
}

/**
 * Compute per-node supply chain status via BFS from capital.
 * Each node gets a supply level based on hop distance and route quality.
 * Isolated nodes accumulate isolation_turns with escalating penalties.
 */
export function computeSupplyChain(input: SupplyChainInput): SupplyChainResult[] {
  const myNodes = input.nodes.filter(n => n.controlled_by === input.playerName);
  if (myNodes.length === 0) return [];

  const myNodeIds = new Set(myNodes.map(n => n.id));

  // Build weighted adjacency (only through non-blocked routes touching our nodes)
  const adj: Record<string, Array<{ target: string; quality: number }>> = {};
  for (const r of input.routes) {
    if (r.control_state === "blocked") continue;
    const aOurs = myNodeIds.has(r.node_a);
    const bOurs = myNodeIds.has(r.node_b);
    if (!aOurs && !bOurs) continue;

    // Route quality: capacity * safety * (1 - damage)
    const quality = Math.max(0.1,
      (r.capacity_value / 10) * (r.safety_value / 10) * (1 - (r.damage_level || 0) / 10)
    );

    if (!adj[r.node_a]) adj[r.node_a] = [];
    if (!adj[r.node_b]) adj[r.node_b] = [];
    adj[r.node_a].push({ target: r.node_b, quality });
    adj[r.node_b].push({ target: r.node_a, quality });
  }

  // BFS from primary cities
  const capitals = myNodes.filter(n => n.node_type === "primary_city");
  const startNodes = capitals.length > 0 ? capitals : [myNodes[0]];

  const visited = new Map<string, { hopDistance: number; quality: number; sourceId: string }>();
  const queue: Array<{ id: string; hops: number; quality: number; sourceId: string }> = [];

  for (const s of startNodes) {
    visited.set(s.id, { hopDistance: 0, quality: 1.0, sourceId: s.id });
    queue.push({ id: s.id, hops: 0, quality: 1.0, sourceId: s.id });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of (adj[current.id] || [])) {
      if (!myNodeIds.has(edge.target)) continue;
      const newHops = current.hops + 1;
      const newQuality = current.quality * edge.quality;
      const existing = visited.get(edge.target);
      // Visit if not visited or found better quality path
      if (!existing || newQuality > existing.quality) {
        visited.set(edge.target, { hopDistance: newHops, quality: newQuality, sourceId: current.sourceId });
        queue.push({ id: edge.target, hops: newHops, quality: newQuality, sourceId: current.sourceId });
      }
    }
  }

  // Build previous state lookup
  const prevMap = new Map<string, number>();
  for (const p of input.previousState) {
    prevMap.set(p.node_id, p.isolation_turns);
  }

  // Generate results
  const results: SupplyChainResult[] = [];
  for (const node of myNodes) {
    const info = visited.get(node.id);
    const connected = !!info;
    const prevIsolation = prevMap.get(node.id) || 0;
    const isolationTurns = connected ? 0 : prevIsolation + 1;

    // Supply level: 10 at capital, decreasing with hops and route quality
    let supplyLevel = 10;
    let routeQuality = 1.0;
    let hopDistance = 0;
    let sourceId: string | null = null;

    if (connected && info) {
      hopDistance = info.hopDistance;
      routeQuality = Math.round(info.quality * 100) / 100;
      sourceId = info.sourceId;
      // Supply decays: -1 per hop, multiplied by route quality
      supplyLevel = Math.max(1, Math.round((10 - hopDistance * 1.5) * routeQuality));
    } else {
      supplyLevel = Math.max(0, 3 - isolationTurns); // Rapidly decays when isolated
      routeQuality = 0;
    }

    // Compute penalties based on supply level and isolation
    // Production: 100% at supply 10, down to 20% at supply 0
    const productionModifier = connected
      ? Math.round((0.2 + 0.8 * (supplyLevel / 10)) * 100) / 100
      : Math.max(0.1, Math.round((0.3 - isolationTurns * 0.05) * 100) / 100);

    // Stability: 0 when fully supplied, up to -25 when isolated
    const stabilityModifier = connected
      ? Math.round(Math.max(-10, (supplyLevel - 7) * -2))
      : Math.round(Math.min(0, -10 - isolationTurns * 5));

    // Morale: 0 at good supply, up to -30 when isolated
    const moraleModifier = connected
      ? Math.round(Math.max(-10, (supplyLevel - 6) * -2))
      : Math.round(Math.min(0, -15 - isolationTurns * 5));

    results.push({
      node_id: node.id,
      connected_to_capital: connected,
      isolation_turns: isolationTurns,
      supply_level: supplyLevel,
      route_quality: routeQuality,
      production_modifier: productionModifier,
      stability_modifier: stabilityModifier,
      morale_modifier: moraleModifier,
      supply_source_node_id: sourceId,
      hop_distance: hopDistance,
    });
  }

  return results;
}

// ═══════════════════════════════════════════
// NODE CLASSIFICATION — Hybrid System
// Geographic types (fixed from terrain): transit, resource, fortress
// Functional types (emergent from flow data): trade_hub, food_basin, sacred, generic
// ═══════════════════════════════════════════

export type NodeClass = "transit" | "trade_hub" | "food_basin" | "sacred" | "resource" | "fortress" | "generic";

export interface NodeClassificationInput {
  id: string;
  node_type: string;        // existing DB field (e.g. "settlement", "fortress", "village")
  flow_role: string;        // existing (hub, regulator, gateway, producer)
  is_major: boolean;
  strategic_resource_type: string | null;
  fortification_level: number;
  defense_value: number;
  wealth_output: number;
  production_output: number;
  cumulative_trade_flow: number;
  food_value: number;       // grain-related production
  sacred_influence: number; // from temples/clerics
  connectivity_score: number;
  hex_q: number;
  hex_r: number;
  // Route context
  routeCount: number;       // number of routes through this node
  isChoke: boolean;         // single path through this area
}

/**
 * Classify a node using hybrid rules:
 * 1. Geographic types take priority if terrain dictates
 * 2. Functional types emerge from flow data thresholds
 */
export function classifyNode(n: NodeClassificationInput): NodeClass {
  // ── Geographic (fixed) ──
  // Fortress: high fortification or explicit fortress node type
  if (n.fortification_level >= 3 || n.node_type === "fortress" || n.flow_role === "regulator") {
    return "fortress";
  }
  // Resource: has strategic resource
  if (n.strategic_resource_type && n.strategic_resource_type !== "NONE") {
    return "resource";
  }
  // Transit: choke point or gateway with high route count
  if (n.isChoke || (n.flow_role === "gateway" && n.routeCount >= 3)) {
    return "transit";
  }

  // ── Functional (emergent) ──
  // Trade hub: high cumulative trade flow or wealth output
  if (n.cumulative_trade_flow > 150 || n.wealth_output > 20) {
    return "trade_hub";
  }
  // Food basin: high food value (grain production)
  if (n.food_value > 15) {
    return "food_basin";
  }
  // Sacred: significant religious influence
  if (n.sacred_influence > 10) {
    return "sacred";
  }

  return "generic";
}

// ═══════════════════════════════════════════
// NODE SCORING — Settlement Opportunity
// ═══════════════════════════════════════════

export interface NodeScoreWeights {
  trade_potential: number;
  food_value: number;
  strategic_control: number;
  resource_unlock: number;
  sacred_influence: number;
  defensive_position: number;
}

export const DEFAULT_NODE_SCORE_WEIGHTS: NodeScoreWeights = {
  trade_potential: 0.25,
  food_value: 0.20,
  strategic_control: 0.20,
  resource_unlock: 0.15,
  sacred_influence: 0.10,
  defensive_position: 0.10,
};

export interface NodeScoreInput {
  // Trade
  cumulative_trade_flow: number;
  wealth_output: number;
  connectivity_score: number;
  routeCount: number;
  // Food
  food_value: number;
  // Strategic
  isChoke: boolean;
  fortification_level: number;
  defense_value: number;
  throughput_military: number;
  // Resource
  strategic_resource_type: string | null;
  strategic_resource_tier: number;
  // Sacred
  sacred_influence: number;
  faith_output: number;
  // Defensive
  hex_terrain_defense: number; // terrain bonus (0-20)
}

/**
 * Compute composite node opportunity score (0-100).
 * Used by AI for settlement placement decisions.
 */
export function computeNodeScore(
  input: NodeScoreInput,
  weights: NodeScoreWeights = DEFAULT_NODE_SCORE_WEIGHTS,
): number {
  // Normalize each dimension to 0-100
  const trade = Math.min(100, (input.cumulative_trade_flow * 0.3) + (input.wealth_output * 2) + (input.connectivity_score * 0.5) + (input.routeCount * 8));
  const food = Math.min(100, input.food_value * 5);
  const strategic = Math.min(100,
    (input.isChoke ? 40 : 0) +
    (input.fortification_level * 10) +
    (input.defense_value * 0.5) +
    (input.throughput_military * 0.3)
  );
  const resource = Math.min(100,
    input.strategic_resource_type && input.strategic_resource_type !== "NONE"
      ? 30 + input.strategic_resource_tier * 25
      : 0
  );
  const sacred = Math.min(100, (input.sacred_influence * 5) + (input.faith_output * 3));
  const defensive = Math.min(100, (input.hex_terrain_defense * 3) + (input.defense_value * 0.8) + (input.fortification_level * 15));

  const score =
    trade * weights.trade_potential +
    food * weights.food_value +
    strategic * weights.strategic_control +
    resource * weights.resource_unlock +
    sacred * weights.sacred_influence +
    defensive * weights.defensive_position;

  return Math.round(Math.min(100, score));
}

// ═══════════════════════════════════════════
// COLLAPSE CHAINS — Tiered impact on node loss
// ═══════════════════════════════════════════

export interface CollapseEffect {
  node_id: string;
  node_class: NodeClass;
  severity: "minor" | "moderate" | "critical";  // tiered by importance
  effects: {
    wealth_modifier: number;    // % change to regional wealth (-50 for trade_hub loss)
    stability_modifier: number; // flat stability change
    food_modifier: number;      // % change to food supply
    faith_modifier: number;     // flat faith pressure change
    morale_modifier: number;    // flat morale change for armies in region
    isolation_risk: boolean;    // can cause supply chain break
  };
  narrative_tag: string;        // for chronicle generation (e.g. "fall_of_trade_hub")
}

/**
 * Compute the tiered collapse effects if a node changes control or is destroyed.
 * Severity depends on the node's importance_score:
 *   < 30: minor, 30-60: moderate, > 60: critical
 */
export function computeCollapseEffects(
  nodeClass: NodeClass,
  importanceScore: number,
): CollapseEffect["effects"] & { severity: CollapseEffect["severity"]; narrative_tag: string } {
  const severity: CollapseEffect["severity"] =
    importanceScore > 60 ? "critical" : importanceScore > 30 ? "moderate" : "minor";

  const severityMult = severity === "critical" ? 1.0 : severity === "moderate" ? 0.6 : 0.3;

  // Base effects per node class
  const baseEffects: Record<NodeClass, { w: number; s: number; f: number; fa: number; m: number; iso: boolean; tag: string }> = {
    trade_hub:  { w: -50, s: -15, f: 0,   fa: 0,   m: -10, iso: false, tag: "fall_of_trade_hub" },
    food_basin: { w: -10, s: -20, f: -40, fa: 0,   m: -15, iso: false, tag: "famine_crisis" },
    sacred:     { w: 0,   s: -25, f: 0,   fa: -30, m: -20, iso: false, tag: "sacred_node_lost" },
    transit:    { w: -20, s: -10, f: -10, fa: 0,   m: -5,  iso: true,  tag: "strategic_isolation" },
    fortress:   { w: -5,  s: -10, f: 0,   fa: 0,   m: -25, iso: true,  tag: "fortress_fallen" },
    resource:   { w: -15, s: -5,  f: 0,   fa: 0,   m: -10, iso: false, tag: "resource_lost" },
    generic:    { w: -5,  s: -5,  f: -5,  fa: 0,   m: -5,  iso: false, tag: "territory_lost" },
  };

  const base = baseEffects[nodeClass];
  return {
    severity,
    wealth_modifier: Math.round(base.w * severityMult),
    stability_modifier: Math.round(base.s * severityMult),
    food_modifier: Math.round(base.f * severityMult),
    faith_modifier: Math.round(base.fa * severityMult),
    morale_modifier: Math.round(base.m * severityMult),
    isolation_risk: base.iso && severity !== "minor",
    narrative_tag: base.tag,
  };
}

/**
 * Compute collapse_severity for a node (0-100).
 * This is stored in DB and used by AI to evaluate strategic importance.
 */
export function computeCollapseSeverity(nodeClass: NodeClass, importanceScore: number): number {
  const classWeight: Record<NodeClass, number> = {
    trade_hub: 1.3, food_basin: 1.4, sacred: 1.1, transit: 1.2,
    fortress: 1.0, resource: 0.9, generic: 0.5,
  };
  return Math.round(Math.min(100, importanceScore * (classWeight[nodeClass] || 0.5)));
}

// ═══════════════════════════════════════════
// HEX-BASED FLOW PATHFINDING
// Dijkstra across hex grid between strategic nodes.
// Cost depends on terrain, infrastructure, control, military presence.
// ═══════════════════════════════════════════

/** Biome family → base traversal cost */
export const BIOME_TRAVERSAL_COST: Record<string, number> = {
  grassland: 1.0,
  plains: 1.0,
  steppe: 1.2,
  forest: 1.8,
  dense_forest: 2.5,
  hills: 2.0,
  mountain: 8.0,
  desert: 2.5,
  tundra: 3.0,
  swamp: 3.5,
  wetland: 2.0,
  coastal: 1.0,
  ocean: 0.8,  // sea travel is efficient
  river_valley: 0.8,
  delta: 0.7,
};

export interface HexCostContext {
  biome_family: string;
  mean_height: number;
  has_river: boolean;
  has_bridge: boolean;
  is_passable: boolean;
  coastal: boolean;
  /** 0 = no infrastructure, 1 = path, 2 = road, 3 = paved */
  infrastructure_level: number;
  /** Who controls this hex (player name or null) */
  controlled_by: string | null;
  /** Is there a fortress on this hex */
  has_fortress: boolean;
  /** Is there active conflict on this hex */
  is_contested: boolean;
  /** Existing trade density (0-100) — high density = lower cost (established corridor) */
  trade_density: number;
}

/**
 * Compute traversal cost for a single hex.
 * Lower = easier to traverse. 0 = impassable.
 */
export function hexTraversalCost(
  hex: HexCostContext,
  /** The player evaluating the path */
  forPlayer: string | null = null,
): number {
  if (!hex.is_passable) return Infinity;

  let cost = BIOME_TRAVERSAL_COST[hex.biome_family] ?? 2.0;

  // Height penalty: steep terrain costs more
  if (hex.mean_height > 0.7) cost += (hex.mean_height - 0.7) * 5;

  // River crossing: expensive unless bridged
  if (hex.has_river && !hex.has_bridge) cost += 3.0;

  // Infrastructure discount
  const infraDiscount = [0, 0.15, 0.30, 0.45][hex.infrastructure_level] ?? 0;
  cost *= (1 - infraDiscount);

  // Political control penalty: hostile territory costs more
  if (hex.controlled_by && forPlayer && hex.controlled_by !== forPlayer) {
    cost *= 1.5;  // 50% penalty in foreign territory
  }

  // Fortress on hex: major control point
  if (hex.has_fortress) {
    if (hex.controlled_by === forPlayer) {
      cost *= 0.7;  // Own fortress = safe corridor
    } else if (hex.controlled_by) {
      cost *= 2.5;  // Enemy fortress = massive choke
    }
  }

  // Contested hex: risky
  if (hex.is_contested) cost *= 1.8;

  // Trade density discount: established corridors are cheaper
  if (hex.trade_density > 0) {
    cost *= Math.max(0.6, 1 - hex.trade_density * 0.004);
  }

  // Coastal bonus for coastal trade
  if (hex.coastal) cost *= 0.9;

  return Math.round(cost * 100) / 100;
}

/** Axial hex neighbors */
const HEX_NEIGHBORS = [
  { dq: 1, dr: 0 }, { dq: -1, dr: 0 },
  { dq: 0, dr: 1 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: -1, dr: 1 },
];

export interface DijkstraResult {
  path: Array<{ q: number; r: number; cost: number }>;
  totalCost: number;
  bottleneck: { q: number; r: number; cost: number } | null;
  pathLength: number;
}

/**
 * Dijkstra shortest path between two hexes on the grid.
 * hexCostFn returns traversal cost for a given (q, r), or Infinity if impassable.
 * maxRange limits search radius to avoid infinite exploration on large maps.
 */
export function dijkstraHexPath(
  startQ: number, startR: number,
  endQ: number, endR: number,
  hexCostFn: (q: number, r: number) => number,
  maxRange: number = 40,
): DijkstraResult | null {
  const key = (q: number, r: number) => `${q},${r}`;
  const startKey = key(startQ, startR);
  const endKey = key(endQ, endR);

  if (startKey === endKey) {
    return { path: [{ q: startQ, r: startR, cost: 0 }], totalCost: 0, bottleneck: null, pathLength: 0 };
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();

  // Simple priority queue (array-based, fine for node-to-node with maxRange ~40)
  const pq: Array<{ q: number; r: number; cost: number }> = [];

  dist.set(startKey, 0);
  pq.push({ q: startQ, r: startR, cost: 0 });

  while (pq.length > 0) {
    // Extract minimum
    pq.sort((a, b) => a.cost - b.cost);
    const current = pq.shift()!;
    const ck = key(current.q, current.r);

    if (visited.has(ck)) continue;
    visited.add(ck);

    if (ck === endKey) break;

    // Expand neighbors
    for (const { dq, dr } of HEX_NEIGHBORS) {
      const nq = current.q + dq;
      const nr = current.r + dr;
      const nk = key(nq, nr);

      if (visited.has(nk)) continue;

      // Range limit
      const dFromStart = (Math.abs(nq - startQ) + Math.abs(nq - startQ + nr - startR) + Math.abs(nr - startR)) / 2;
      if (dFromStart > maxRange) continue;

      const edgeCost = hexCostFn(nq, nr);
      if (edgeCost === Infinity || edgeCost <= 0) continue;

      const newDist = current.cost + edgeCost;
      if (newDist < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, newDist);
        prev.set(nk, ck);
        pq.push({ q: nq, r: nr, cost: newDist });
      }
    }
  }

  // Reconstruct path
  if (!dist.has(endKey)) return null; // No path found

  const path: Array<{ q: number; r: number; cost: number }> = [];
  let current = endKey;
  while (current) {
    const [q, r] = current.split(",").map(Number);
    const stepCost = hexCostFn(q, r);
    path.unshift({ q, r, cost: current === startKey ? 0 : stepCost });
    current = prev.get(current)!;
    if (current === undefined && path[0].q !== startQ) break;
  }

  // Find bottleneck (highest single-hex cost)
  let bottleneck: DijkstraResult["bottleneck"] = null;
  let maxCost = 0;
  for (const step of path) {
    if (step.cost > maxCost) {
      maxCost = step.cost;
      bottleneck = step;
    }
  }

  return {
    path,
    totalCost: dist.get(endKey)!,
    bottleneck,
    pathLength: path.length,
  };
}

/**
 * Compute flow paths between all connected node pairs.
 * Returns path data for each route in the province graph.
 */
export interface FlowPathInput {
  nodeA: { id: string; hex_q: number; hex_r: number };
  nodeB: { id: string; hex_q: number; hex_r: number };
  routeId?: string;
  flowType: string;
}

export interface FlowPathResult {
  node_a: string;
  node_b: string;
  route_id: string | null;
  flow_type: string;
  hex_path: Array<{ q: number; r: number; cost: number }>;
  total_cost: number;
  bottleneck: { q: number; r: number; cost: number } | null;
  path_length: number;
}

export function computeFlowPath(
  input: FlowPathInput,
  hexCostFn: (q: number, r: number) => number,
  maxRange: number = 40,
): FlowPathResult | null {
  const result = dijkstraHexPath(
    input.nodeA.hex_q, input.nodeA.hex_r,
    input.nodeB.hex_q, input.nodeB.hex_r,
    hexCostFn,
    maxRange,
  );

  if (!result) return null;

  return {
    node_a: input.nodeA.id,
    node_b: input.nodeB.id,
    route_id: input.routeId ?? null,
    flow_type: input.flowType,
    hex_path: result.path,
    total_cost: result.totalCost,
    bottleneck: result.bottleneck,
    path_length: result.pathLength,
  };
}
