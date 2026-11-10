// Player-chosen world creation settings (rivers, opponents, cities, wealth, spacing).
// Pure helpers so every creation step derives the same numbers from the same choice.

export type Level3 = "low" | "normal" | "high";

export interface WorldGameSettings {
  /** How many rivers the terrain should spawn (rivers still follow terrain downhill). */
  riverAmount?: Level3;
  /** How long / important rivers are. */
  riverLength?: Level3;
  /** Number of AI opponents (0–7). Undefined = by world size. */
  aiOpponents?: number;
  /** AI strength: affects AI start resources and default temperament. */
  aiDifficulty?: "easy" | "normal" | "hard";
  /** Starting cities per realm (1–3). */
  startingCities?: number;
  /** Amount of neutral settlements on the map. */
  neutralTowns?: "none" | Level3;
  /** Starting gold and grain of the player. */
  startingWealth?: Level3;
  /** Distance between realms' starting positions. */
  realmDistance?: Level3;
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const L3 = ["low", "normal", "high"] as const;

export function normalizeGameSettings(raw: unknown): Required<Omit<WorldGameSettings, "aiOpponents">> & { aiOpponents?: number } {
  const s = (raw && typeof raw === "object" ? raw : {}) as WorldGameSettings;
  const ai = Number(s.aiOpponents);
  const cities = Number(s.startingCities);
  return {
    riverAmount: pick(s.riverAmount, L3, "normal"),
    riverLength: pick(s.riverLength, L3, "normal"),
    aiOpponents: Number.isFinite(ai) ? Math.max(0, Math.min(7, Math.round(ai))) : undefined,
    aiDifficulty: pick(s.aiDifficulty, ["easy", "normal", "hard"] as const, "normal"),
    startingCities: Number.isFinite(cities) ? Math.max(1, Math.min(3, Math.round(cities))) : 1,
    neutralTowns: pick(s.neutralTowns, ["none", ...L3] as const, "normal"),
    startingWealth: pick(s.startingWealth, L3, "normal"),
    realmDistance: pick(s.realmDistance, L3, "normal"),
  };
}

/** River network knobs: more sources (lower divisor) and longer walks. */
export function riverOptions(s: Pick<WorldGameSettings, "riverAmount" | "riverLength">) {
  const amount = s.riverAmount ?? "normal", length = s.riverLength ?? "normal";
  return {
    landPerRiver: amount === "low" ? 90 : amount === "high" ? 30 : 55,
    minRivers: amount === "low" ? 2 : amount === "high" ? 5 : 3,
    maxLength: length === "low" ? 8 : length === "high" ? 24 : 14,
  };
}

/** Fraction of the half-map used as minimum distance between realm starts. */
export function realmSpacingFactor(d?: Level3) {
  return d === "low" ? 0.25 : d === "high" ? 0.55 : 0.4;
}

export function neutralMultiplier(n?: WorldGameSettings["neutralTowns"]) {
  return n === "none" ? 0 : n === "low" ? 0.5 : n === "high" ? 1.8 : 1;
}

/** Player start reserves. */
export function startingReserves(w?: Level3) {
  return w === "low" ? { gold: 50, grain: 10 } : w === "high" ? { gold: 250, grain: 50 } : { gold: 100, grain: 20 };
}

/** AI start reserves multiplier and default temperament when the player left it blank. */
export function aiDifficultyProfile(d?: WorldGameSettings["aiDifficulty"]) {
  return d === "easy" ? { reserveMultiplier: 0.7, defaultPersonality: "peaceful" }
    : d === "hard" ? { reserveMultiplier: 1.5, defaultPersonality: "aggressive" }
    : { reserveMultiplier: 1, defaultPersonality: "balanced" };
}

/**
 * Premise-derived defaults: the analysed world (biomes, land ratio, mountains)
 * suggests river amount/length. Player choices always win over these.
 */
export function premiseDerivedSettings(terrain?: {
  targetLandRatio?: number; mountainDensity?: number; biomeWeights?: Record<string, number>;
} | null): Pick<WorldGameSettings, "riverAmount" | "riverLength"> {
  if (!terrain) return {};
  const w = terrain.biomeWeights ?? {};
  const total = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0) || 1;
  const share = (...keys: string[]) => keys.reduce((a, k) => a + (Number(w[k]) || 0), 0) / total;
  const wet = share("forest", "swamp", "wetland", "marsh", "jungle", "rainforest", "taiga");
  const dry = share("desert", "tundra", "steppe", "savanna", "badlands", "volcanic");
  const moisture = wet - dry;
  const riverAmount = moisture > 0.15 ? "high" : moisture < -0.2 ? "low" : "normal";
  const land = terrain.targetLandRatio ?? 0.5;
  const mountains = terrain.mountainDensity ?? 0.3;
  // Big land masses with highlands grow long rivers; small islands only streams.
  const riverLength = land < 0.3 ? "low" : land > 0.55 && mountains > 0.25 ? "high" : "normal";
  return { riverAmount, riverLength };
}

/** Final settings: premise defaults overridden by explicit player choices. */
export function effectiveGameSettings(player: WorldGameSettings, terrain?: Parameters<typeof premiseDerivedSettings>[0]): WorldGameSettings {
  const derived = premiseDerivedSettings(terrain);
  const out: WorldGameSettings = { ...derived };
  for (const [k, v] of Object.entries(player)) if (v !== undefined) (out as any)[k] = v;
  return out;
}
