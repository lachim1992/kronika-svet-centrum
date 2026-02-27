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
