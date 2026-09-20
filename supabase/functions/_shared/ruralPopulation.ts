// ─────────────────────────────────────────────────────────────────────────────
// Rural population — PHASE B (shadow only)
//
// Deterministic carrying capacity and rural population per passable world cell,
// derived purely from province_hexes geography plus the cell seed.
//
// CONTRACT (Phase B):
//   • Pure function of (cell geography, seed, session seed). No randomness.
//   • Same seed/state ⇒ byte-identical result.
//   • Shadow only: nothing here reads or writes city population, treasury,
//     trade, demand, production or AI state.
//   • Transient scores (opportunity, migration pressure) are NEVER stored here;
//     hex_population holds only capacity / rural / mobile / last_resolved_turn.
//   • Phase C will consume this pool for atomic founding and local migration.
// ─────────────────────────────────────────────────────────────────────────────

export interface RuralCell {
  q: number;
  r: number;
  seed: string;
  is_passable: boolean;
  biome_family: string;
  moisture_band: number;
  temp_band: number;
  mean_height: number;
  forest_density: number | null;
  coastal: boolean;
  has_river: boolean;
  movement_cost: number;
  access_score: number | null;
}

export interface RuralPopulationRow {
  q: number;
  r: number;
  carrying_capacity: number;
  rural_population: number;
  mobile_population: number;
}

/** Base carrying capacity per biome family (inhabitants a single cell can feed). */
export const BIOME_CAPACITY: Record<string, number> = {
  grassland: 420,
  plains: 420,
  savanna: 300,
  steppe: 240,
  forest: 300,
  taiga: 150,
  jungle: 220,
  rainforest: 220,
  wetland: 200,
  marsh: 200,
  hills: 260,
  highland: 200,
  mountain: 70,
  alpine: 60,
  desert: 50,
  arid: 90,
  tundra: 60,
  glacier: 0,
  ice: 0,
  water: 0,
  ocean: 0,
  lake: 0,
};

export const RURAL_DEFAULT_CAPACITY = 180;
/** Share of carrying capacity that is actually settled at world start. */
export const RURAL_SETTLED_SHARE = 0.55;
/** Share of rural inhabitants willing to move in a given turn. */
export const RURAL_MOBILE_SHARE = 0.08;

/** Deterministic 32-bit hash — stable across runtimes, no randomness. */
export function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

/** Deterministic unit value in [0,1) derived from the cell identity. */
export function cellNoise(sessionSeed: string, cell: { q: number; r: number; seed: string }): number {
  return stableHash(`${sessionSeed}|${cell.seed}|${cell.q}|${cell.r}`) / 4294967296;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Carrying capacity of a single cell. Deterministic, geography driven.
 * Impassable cells and water always yield 0.
 */
export function carryingCapacityForCell(sessionSeed: string, cell: RuralCell): number {
  if (!cell.is_passable) return 0;
  const biome = String(cell.biome_family ?? "").toLowerCase();
  const base = BIOME_CAPACITY[biome] ?? RURAL_DEFAULT_CAPACITY;
  if (base <= 0) return 0;

  // Moisture: bands run 0 (dry) .. 4 (wet); middle bands feed most people.
  const moisture = clamp(Number(cell.moisture_band ?? 2), 0, 4);
  const moistureFactor = 1 - Math.abs(moisture - 2.4) * 0.16;

  // Temperature: bands run 0 (cold) .. 4 (hot); temperate is best.
  const temp = clamp(Number(cell.temp_band ?? 2), 0, 4);
  const tempFactor = 1 - Math.abs(temp - 2.2) * 0.14;

  // Altitude penalty (mean_height normalised 0..1 in worldgen).
  const height = clamp(Number(cell.mean_height ?? 0), 0, 1);
  const heightFactor = 1 - height * 0.55;

  // Dense forest must be cleared before it feeds anyone.
  const forest = clamp(Number(cell.forest_density ?? 0), 0, 1);
  const forestFactor = 1 - forest * 0.2;

  // Rivers, coasts and accessibility add real settlement value.
  const waterBonus = (cell.has_river ? 0.18 : 0) + (cell.coastal ? 0.12 : 0);
  const access = clamp(Number(cell.access_score ?? 0.5), 0, 1);
  const accessBonus = access * 0.1;
  const movement = clamp(Number(cell.movement_cost ?? 1), 1, 6);
  const movementFactor = 1 - (movement - 1) * 0.06;

  // Deterministic local variation, ±8 %.
  const variation = 0.92 + cellNoise(sessionSeed, cell) * 0.16;

  const capacity = base
    * clamp(moistureFactor, 0.25, 1.25)
    * clamp(tempFactor, 0.25, 1.25)
    * clamp(heightFactor, 0.2, 1)
    * forestFactor
    * clamp(movementFactor, 0.4, 1)
    * (1 + waterBonus + accessBonus)
    * variation;

  return Math.max(0, Math.round(capacity));
}

/** Full deterministic shadow row for one cell. */
export function ruralPopulationForCell(sessionSeed: string, cell: RuralCell): RuralPopulationRow {
  const capacity = carryingCapacityForCell(sessionSeed, cell);
  // Settled share varies deterministically between 45 % and 65 % of capacity.
  const share = RURAL_SETTLED_SHARE + (cellNoise(sessionSeed, cell) - 0.5) * 0.2;
  const rural = Math.min(capacity, Math.max(0, Math.round(capacity * clamp(share, 0.3, 0.8))));
  const mobile = Math.min(rural, Math.round(rural * RURAL_MOBILE_SHARE));
  return { q: cell.q, r: cell.r, carrying_capacity: capacity, rural_population: rural, mobile_population: mobile };
}

/** Deterministic, order-independent projection for a whole world. */
export function ruralPopulationForWorld(sessionSeed: string, cells: RuralCell[]): RuralPopulationRow[] {
  return [...cells]
    .sort((a, b) => (a.q - b.q) || (a.r - b.r))
    .map((c) => ruralPopulationForCell(sessionSeed, c))
    .filter((r) => r.carrying_capacity > 0);
}
