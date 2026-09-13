// Deterministic sub-parcel model: every map cell is divided into 36 parcels (6 x 6).
// The layout is derived from the world seed (session id) plus the cell terrain, so it is
// identical on client and server and never changes once a cell has been materialized.
// Server-side twin of src/lib/tileParcels.ts — keep the logic in sync.

export const TILE_PARCEL_COLS = 6;
export const TILE_PARCEL_ROWS = 6;
export const TILE_PARCEL_COUNT = TILE_PARCEL_COLS * TILE_PARCEL_ROWS;

export type TileTerrain = {
  biome_family?: string | null;
  elevation?: number | null;
  has_river?: boolean | null;
  river_direction?: string | null;
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

const FAMILY_ALIAS: Record<string, string> = {
  swamp: "wetland",
  marsh: "wetland",
  ocean: "sea",
  water: "sea",
  savanna: "steppe",
  taiga: "forest",
  woodland: "forest",
  rainforest: "jungle",
  mountain: "mountains",
  hill: "hills",
};

function familyKey(raw: string | null | undefined): string {
  const key = (raw || "plains").toLowerCase();
  return FAMILY_ALIAS[key] ?? key;
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Stable pseudo-random in [0,1) for a seed string. */
export function seeded(text: string): number {
  return fnv1a(text) / 0x100000000;
}

function pickWeighted(defs: Array<SubBiomeDef & { blendWeight: number }>, roll: number): SubBiomeDef {
  const total = defs.reduce((sum, def) => sum + def.blendWeight, 0);
  let cursor = roll * total;
  for (const def of defs) {
    cursor -= def.blendWeight;
    if (cursor <= 0) return def;
  }
  return defs[defs.length - 1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Terrain of a cardinal neighbour cell, used to blend sub-biomes across the border. */
export type NeighbourTerrain = { dx: number; dy: number; terrain: TileTerrain };

type WeightedDef = SubBiomeDef & { blendWeight: number };

const WATER_DEFS: Record<string, SubBiomeDef> = {
  open_water: { key: "open_water", weight: 1, cost: 3.0, slots: 0, relief: -30, buildable: false },
  lake: { key: "lake", weight: 1, cost: 2.6, slots: 0, relief: -16, buildable: false },
  river_channel: { key: "river_channel", weight: 1, cost: 2.2, slots: 0, relief: -12, buildable: false },
  river_bank: { key: "river_bank", weight: 1, cost: 1.05, slots: 2, relief: -6 },
};

/** A cell counts as water when its biome is sea or it sits below the shoreline. */
function isWaterTerrain(terrain: TileTerrain): boolean {
  const family = familyKey(terrain.biome_family);
  return family === "sea" || Number(terrain.elevation ?? 40) < 8;
}

function defsForTerrain(terrain: TileTerrain, asNeighbour: boolean): SubBiomeDef[] {
  const family = familyKey(terrain.biome_family);
  const isSea = family === "sea" || family === "ocean";
  // A sea neighbour pushes shoreline parcels onto the land cell, never open water.
  if (isSea) return asNeighbour ? SUB_BIOMES.coast : SUB_BIOMES.sea;
  const base = SUB_BIOMES[family] ?? DEFAULT_SET;
  return terrain.is_coastal ? [...base, ...SUB_BIOMES.coast] : base;
}

/** How strongly a neighbour cell reaches into the parcel grid (0 = not at all, 2 = border row). */
function neighbourReach(dx: number, dy: number, parcelX: number, parcelY: number): number {
  let distance = Infinity;
  if (dx > 0) distance = TILE_PARCEL_COLS - 1 - parcelX;
  else if (dx < 0) distance = parcelX;
  else if (dy > 0) distance = TILE_PARCEL_ROWS - 1 - parcelY;
  else if (dy < 0) distance = parcelY;
  return Math.max(0, 2 - distance);
}

const parcelIndexOf = (x: number, y: number) => y * TILE_PARCEL_COLS + x;
const insideParcelGrid = (x: number, y: number) =>
  x >= 0 && y >= 0 && x < TILE_PARCEL_COLS && y < TILE_PARCEL_ROWS;

/** Parcel sitting on the shared border with a neighbour, `depth` rows inside the cell. */
function borderParcel(dx: number, dy: number, along: number, depth: number): { x: number; y: number } {
  if (dx > 0) return { x: TILE_PARCEL_COLS - 1 - depth, y: along };
  if (dx < 0) return { x: depth, y: along };
  if (dy > 0) return { x: along, y: TILE_PARCEL_ROWS - 1 - depth };
  return { x: along, y: depth };
}

/**
 * Where a river crosses the border between two cells.
 * The seed is symmetric for both cells, so the channel always lines up across the border.
 */
function riverCrossing(sessionId: string, gridX: number, gridY: number, dx: number, dy: number): number {
  const ax = gridX, ay = gridY, bx = gridX + dx, by = gridY + dy;
  const first = `${ax},${ay}`;
  const second = `${bx},${by}`;
  const key = first < second ? `${first}|${second}` : `${second}|${first}`;
  const span = Math.max(1, (dx !== 0 ? TILE_PARCEL_ROWS : TILE_PARCEL_COLS) - 2);
  return 1 + Math.floor(seeded(`${sessionId}:river-edge:${key}`) * span);
}

export type RiverChannelCell = { x: number; y: number };

/** Exact one-parcel-wide river footprint used by both parcel generation and map rendering. */
export function riverChannelCells(
  sessionId: string,
  gridX: number,
  gridY: number,
  terrain: TileTerrain,
  neighbours: NeighbourTerrain[],
): RiverChannelCell[] {
  if (!terrain.has_river || isWaterTerrain(terrain)) return [];
  const cellSeed = `${sessionId}:${gridX}:${gridY}`;
  const directionStep: Record<string, { dx: number; dy: number }> = {
    east: { dx: 1, dy: 0 }, west: { dx: -1, dy: 0 },
    south: { dx: 0, dy: 1 }, north: { dx: 0, dy: -1 },
  };
  const riverEdges: Array<{ dx: number; dy: number }> = [];
  const outgoing = terrain.river_direction ? directionStep[terrain.river_direction] : undefined;
  if (outgoing) riverEdges.push(outgoing);
  for (const neighbour of neighbours) {
    if (!neighbour.terrain.has_river) continue;
    const neighbourOut = neighbour.terrain.river_direction
      ? directionStep[neighbour.terrain.river_direction]
      : undefined;
    if (neighbourOut && neighbour.dx + neighbourOut.dx === 0 && neighbour.dy + neighbourOut.dy === 0) {
      riverEdges.push({ dx: neighbour.dx, dy: neighbour.dy });
    }
  }
  const uniqueEdges = riverEdges.filter((edge, index, all) =>
    all.findIndex(item => item.dx === edge.dx && item.dy === edge.dy) === index
  );
  if (uniqueEdges.length === 1) {
    const edge = uniqueEdges[0];
    uniqueEdges.unshift({ dx: -edge.dx, dy: -edge.dy });
  }
  const centre = {
    x: 2 + Math.floor(seeded(`${cellSeed}:river-cx`) * 2),
    y: 2 + Math.floor(seeded(`${cellSeed}:river-cy`) * 2),
  };
  const channel = new Map<number, RiverChannelCell>();
  const add = (x: number, y: number) => channel.set(parcelIndexOf(x, y), { x, y });
  for (const edge of uniqueEdges) {
    const along = riverCrossing(sessionId, gridX, gridY, edge.dx, edge.dy);
    const entry = borderParcel(edge.dx, edge.dy, along, 0);
    let { x, y } = entry;
    add(x, y);
    let axis = seeded(`${cellSeed}:river-step:${edge.dx}:${edge.dy}`) < 0.5;
    while (x !== centre.x || y !== centre.y) {
      const canX = x !== centre.x;
      const canY = y !== centre.y;
      if ((axis && canX) || !canY) x += x < centre.x ? 1 : -1;
      else y += y < centre.y ? 1 : -1;
      add(x, y);
      axis = !axis;
    }
  }
  return [...channel.values()];
}

/**
 * Water mask of one cell: open sea coves along a water border, deterministic lakes and a
 * river channel that enters and leaves the cell exactly where the neighbouring cells expect it.
 */
function waterLayout(
  sessionId: string,
  gridX: number,
  gridY: number,
  terrain: TileTerrain,
  neighbours: NeighbourTerrain[],
): Map<number, SubBiomeDef> {
  const water = new Map<number, SubBiomeDef>();

  if (isWaterTerrain(terrain)) {
    for (let index = 0; index < TILE_PARCEL_COUNT; index += 1) water.set(index, WATER_DEFS.open_water);
    return water;
  }

  // Water from a neighbouring macro water cell never floods this land cell. The
  // shoreline is expressed by the normal coastal sub-biomes; actual water parcels
  // live primarily inside macro water cells.

  for (const cell of riverChannelCells(sessionId, gridX, gridY, terrain, neighbours)) {
    water.set(parcelIndexOf(cell.x, cell.y), WATER_DEFS.river_channel);
  }

  return water;
}

/**
 * Full deterministic parcel layout of one map cell.
 * The cell's own biome always dominates; cardinal neighbours only bleed into the parcels
 * along their shared border, so a forest next to plains grows woods on that edge.
 * Land sub-biomes are sampled on a coarse 2x2 blob grid so similar terrain clusters instead
 * of producing single-parcel noise; water follows waterLayout().
 */
export function generateTileParcels(
  sessionId: string,
  gridX: number,
  gridY: number,
  terrain: TileTerrain = {},
  neighbours: NeighbourTerrain[] = [],
): TileParcelSpec[] {
  const isSea = isWaterTerrain(terrain) || terrain.is_passable === false;
  const ownDefs = defsForTerrain(terrain, false);
  const OWN_WEIGHT = 6;

  const baseElevation = clamp(Number(terrain.elevation ?? 40), 0, 100);
  const water = waterLayout(sessionId, gridX, gridY, terrain, neighbours);

  return Array.from({ length: TILE_PARCEL_COUNT }, (_, index) => {
    const parcelX = index % TILE_PARCEL_COLS;
    const parcelY = Math.floor(index / TILE_PARCEL_COLS);
    const cellSeed = `${sessionId}:${gridX}:${gridY}:${index}`;
    const waterDef = water.get(index);

    // Weighted pool: own biome plus the share of each bordering biome.
    const pool: WeightedDef[] = ownDefs.map((def) => ({ ...def, blendWeight: def.weight * OWN_WEIGHT }));
    let elevationWeight = OWN_WEIGHT;
    let elevationSum = baseElevation * OWN_WEIGHT;

    if (!isSea) {
      for (const neighbour of neighbours) {
        const reach = neighbourReach(neighbour.dx, neighbour.dy, parcelX, parcelY);
        if (reach <= 0) continue;
        const scale = reach * 1.5;
        for (const def of defsForTerrain(neighbour.terrain, true)) {
          pool.push({ ...def, blendWeight: def.weight * scale });
        }
        const neighbourElevation = clamp(Number(neighbour.terrain.elevation ?? baseElevation), 0, 100);
        elevationSum += neighbourElevation * reach;
        elevationWeight += reach;
      }
    }

    // Coarse blob sampling keeps similar sub-biomes together in 2x2 patches.
    const blobRoll = seeded(`${sessionId}:${gridX}:${gridY}:blob:${Math.floor(parcelX / 2)}:${Math.floor(parcelY / 2)}`);
    const roll = clamp(blobRoll * 0.78 + seeded(`${cellSeed}:biome`) * 0.22, 0, 0.9999);
    const def = waterDef ?? pickWeighted(pool, roll);

    const blendedBase = Math.round(elevationSum / Math.max(1, elevationWeight));
    const noise = Math.round((seeded(`${cellSeed}:relief`) - 0.5) * 8);
    const elevation = clamp(blendedBase + def.relief + noise, 0, 100);
    const steepPenalty = elevation > 72 ? 1 + (elevation - 72) / 90 : 1;
    const buildable = def.buildable !== false && (!isSea || def.buildable === true);
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

/** Claim cost of one sub-parcel: terrain multiplier scaled by how much the city already holds. */
export function parcelClaimCost(multiplier: number, alreadyClaimed: number): { gold: number; production: number } {
  const scale = 1 + alreadyClaimed * 0.04;
  return {
    gold: Math.round(35 * multiplier * scale),
    production: Math.round(25 * multiplier * scale),
  };
}
