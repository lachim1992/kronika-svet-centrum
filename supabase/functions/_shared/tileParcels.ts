// Deterministic sub-parcel model: every map cell is divided into 32 parcels (8 x 4).
// The layout is derived from the world seed (session id) plus the cell terrain, so it is
// identical on client and server and never changes once a cell has been materialized.
// Server-side twin of src/lib/tileParcels.ts — keep the logic in sync.

export const TILE_PARCEL_COLS = 8;
export const TILE_PARCEL_ROWS = 4;
export const TILE_PARCEL_COUNT = TILE_PARCEL_COLS * TILE_PARCEL_ROWS;

export type TileTerrain = {
  biome_family?: string | null;
  elevation?: number | null;
  has_river?: boolean | null;
  is_coastal?: boolean | null;
  is_passable?: boolean | null;
};

export type TileParcelSpec = {
  parcelIndex: number;
  parcelX: number;
  parcelY: number;
  subBiome: string;
  elevation: number;
  buildable: boolean;
  buildCostMultiplier: number;
  capacitySlots: number;
};

type SubBiomeDef = {
  key: string;
  weight: number;
  /** base cost factor for claiming / building on the parcel */
  cost: number;
  /** how many housing slots the parcel can hold */
  slots: number;
  /** relief offset applied on top of the cell elevation */
  relief: number;
  buildable?: boolean;
};

const DEFAULT_SET: SubBiomeDef[] = [
  { key: "open_ground", weight: 4, cost: 1.0, slots: 2, relief: 0 },
  { key: "rocky_patch", weight: 2, cost: 1.35, slots: 1, relief: 8 },
  { key: "shallow_dip", weight: 2, cost: 1.1, slots: 2, relief: -6 },
];

const SUB_BIOMES: Record<string, SubBiomeDef[]> = {
  plains: [
    { key: "fertile_flat", weight: 5, cost: 0.85, slots: 3, relief: -2 },
    { key: "grassland", weight: 4, cost: 1.0, slots: 2, relief: 0 },
    { key: "hillock", weight: 2, cost: 1.2, slots: 2, relief: 9 },
    { key: "boggy_dip", weight: 1, cost: 1.5, slots: 1, relief: -8 },
  ],
  grassland: [
    { key: "grassland", weight: 5, cost: 0.9, slots: 3, relief: 0 },
    { key: "fertile_flat", weight: 3, cost: 0.85, slots: 3, relief: -2 },
    { key: "hillock", weight: 2, cost: 1.2, slots: 2, relief: 9 },
    { key: "thicket", weight: 1, cost: 1.15, slots: 2, relief: 2 },
  ],
  steppe: [
    { key: "dry_flat", weight: 5, cost: 0.95, slots: 3, relief: 0 },
    { key: "grassland", weight: 3, cost: 1.0, slots: 2, relief: 0 },
    { key: "gravel_rise", weight: 2, cost: 1.3, slots: 1, relief: 10 },
  ],
  forest: [
    { key: "dense_forest", weight: 4, cost: 1.35, slots: 1, relief: 3 },
    { key: "clearing", weight: 3, cost: 0.95, slots: 3, relief: 0 },
    { key: "creek_bank", weight: 2, cost: 1.1, slots: 2, relief: -5 },
    { key: "ridge_woods", weight: 2, cost: 1.45, slots: 1, relief: 12 },
  ],
  jungle: [
    { key: "thick_canopy", weight: 5, cost: 1.55, slots: 1, relief: 4 },
    { key: "clearing", weight: 2, cost: 1.1, slots: 2, relief: 0 },
    { key: "creek_bank", weight: 2, cost: 1.25, slots: 2, relief: -4 },
  ],
  hills: [
    { key: "terrace", weight: 4, cost: 1.15, slots: 2, relief: 6 },
    { key: "saddle", weight: 3, cost: 1.0, slots: 2, relief: 2 },
    { key: "steep_slope", weight: 2, cost: 1.6, slots: 1, relief: 18 },
    { key: "sheltered_hollow", weight: 2, cost: 0.95, slots: 3, relief: -6 },
  ],
  mountains: [
    { key: "crag", weight: 4, cost: 2.0, slots: 1, relief: 26, buildable: false },
    { key: "steep_slope", weight: 3, cost: 1.8, slots: 1, relief: 18 },
    { key: "mountain_shelf", weight: 2, cost: 1.4, slots: 2, relief: 12 },
    { key: "pass_floor", weight: 1, cost: 1.2, slots: 2, relief: 4 },
  ],
  desert: [
    { key: "sand_flat", weight: 4, cost: 1.1, slots: 2, relief: 0 },
    { key: "dune", weight: 3, cost: 1.5, slots: 1, relief: 10, buildable: false },
    { key: "rocky_patch", weight: 2, cost: 1.3, slots: 1, relief: 6 },
    { key: "oasis_edge", weight: 1, cost: 0.9, slots: 3, relief: -4 },
  ],
  tundra: [
    { key: "frozen_flat", weight: 4, cost: 1.2, slots: 2, relief: 0 },
    { key: "permafrost_rise", weight: 3, cost: 1.5, slots: 1, relief: 8 },
    { key: "sheltered_hollow", weight: 2, cost: 1.0, slots: 2, relief: -5 },
  ],
  wetland: [
    { key: "reed_marsh", weight: 4, cost: 1.7, slots: 1, relief: -8, buildable: false },
    { key: "raised_bank", weight: 3, cost: 1.2, slots: 2, relief: 4 },
    { key: "fertile_silt", weight: 2, cost: 1.0, slots: 3, relief: -2 },
  ],
  coast: [
    { key: "shore", weight: 4, cost: 1.05, slots: 2, relief: -4 },
    { key: "harbour_flat", weight: 2, cost: 0.9, slots: 3, relief: -2 },
    { key: "cliff_edge", weight: 2, cost: 1.7, slots: 1, relief: 16, buildable: false },
    { key: "dune", weight: 1, cost: 1.4, slots: 1, relief: 6 },
  ],
  sea: [
    { key: "open_water", weight: 1, cost: 3.0, slots: 0, relief: -30, buildable: false },
  ],
};

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Stable pseudo-random in [0,1) for a seed string. */
function seeded(text: string): number {
  return fnv1a(text) / 0x100000000;
}

function pick(defs: SubBiomeDef[], roll: number): SubBiomeDef {
  const total = defs.reduce((sum, def) => sum + def.weight, 0);
  let cursor = roll * total;
  for (const def of defs) {
    cursor -= def.weight;
    if (cursor <= 0) return def;
  }
  return defs[defs.length - 1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Full deterministic parcel layout of one map cell. */
export function generateTileParcels(
  sessionId: string,
  gridX: number,
  gridY: number,
  terrain: TileTerrain = {},
): TileParcelSpec[] {
  const family = (terrain.biome_family || "plains").toLowerCase();
  const isSea = family === "sea" || family === "ocean" || terrain.is_passable === false;
  let defs = SUB_BIOMES[family] ?? DEFAULT_SET;
  if (isSea) defs = SUB_BIOMES.sea;
  else if (terrain.is_coastal) defs = [...defs, ...SUB_BIOMES.coast];

  const baseElevation = clamp(Number(terrain.elevation ?? 40), 0, 100);
  const riverRow = terrain.has_river ? Math.floor(seeded(`${sessionId}:${gridX}:${gridY}:river`) * TILE_PARCEL_ROWS) : -1;

  return Array.from({ length: TILE_PARCEL_COUNT }, (_, index) => {
    const parcelX = index % TILE_PARCEL_COLS;
    const parcelY = Math.floor(index / TILE_PARCEL_COLS);
    const cellSeed = `${sessionId}:${gridX}:${gridY}:${index}`;
    const onRiver = !isSea && parcelY === riverRow && parcelX % 3 !== 2;

    const def = onRiver
      ? { key: "river_bank", weight: 1, cost: 1.05, slots: 2, relief: -6 }
      : pick(defs, seeded(`${cellSeed}:biome`));

    const noise = Math.round((seeded(`${cellSeed}:relief`) - 0.5) * 8);
    const elevation = clamp(baseElevation + def.relief + noise, 0, 100);
    const steepPenalty = elevation > 72 ? 1 + (elevation - 72) / 90 : 1;
    const buildable = def.buildable !== false && !isSea;
    const capacitySlots = buildable ? clamp(elevation > 78 ? def.slots - 1 : def.slots, 1, 3) : 0;

    return {
      parcelIndex: index,
      parcelX,
      parcelY,
      subBiome: def.key,
      elevation,
      buildable,
      buildCostMultiplier: Math.round(def.cost * steepPenalty * 100) / 100,
      capacitySlots,
    };
  });
}

/** Housing capacity a set of parcels supports. */
export const POPULATION_PER_SLOT = 90;

export function parcelPopulationCapacity(slots: number): number {
  return slots * POPULATION_PER_SLOT;
}
