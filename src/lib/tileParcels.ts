// Deterministic sub-parcel model: every map cell is divided into 36 parcels (6 x 6).
// The layout is derived from the world seed (session id) plus the cell terrain, so it is
// identical on client and server and never changes once a cell has been materialized.
// Keep this file byte-identical in logic with supabase/functions/_shared/tileParcels.ts.

export const TILE_PARCEL_COLS = 6;
export const TILE_PARCEL_ROWS = 6;
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
function seeded(text: string): number {
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
  const cellSeed = `${sessionId}:${gridX}:${gridY}`;

  if (isWaterTerrain(terrain)) {
    for (let index = 0; index < TILE_PARCEL_COUNT; index += 1) water.set(index, WATER_DEFS.open_water);
    return water;
  }

  const waterNeighbours = neighbours.filter((n) => isWaterTerrain(n.terrain));

  // 1) Sea reaches into the shared border row, second row only in coves.
  for (const neighbour of waterNeighbours) {
    const span = neighbour.dx !== 0 ? TILE_PARCEL_ROWS : TILE_PARCEL_COLS;
    for (let along = 0; along < span; along += 1) {
      const edge = borderParcel(neighbour.dx, neighbour.dy, along, 0);
      water.set(parcelIndexOf(edge.x, edge.y), WATER_DEFS.open_water);
      const coveSeed = `${cellSeed}:cove:${neighbour.dx}:${neighbour.dy}:${along}`;
      if (seeded(coveSeed) < 0.4) {
        const cove = borderParcel(neighbour.dx, neighbour.dy, along, 1);
        water.set(parcelIndexOf(cove.x, cove.y), WATER_DEFS.open_water);
      }
    }
  }

  // 2) River channel: connect every river border to one confluence point inside the cell.
  const channel: Array<{ x: number; y: number }> = [];
  if (terrain.has_river) {
    const riverEdges = neighbours
      .filter((n) => n.terrain.has_river || isWaterTerrain(n.terrain))
      .map((n) => ({ dx: n.dx, dy: n.dy }));
    if (riverEdges.length === 0) {
      const fallback = [{ dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }];
      riverEdges.push(fallback[Math.floor(seeded(`${cellSeed}:river-fallback`) * fallback.length)]);
    }
    const confluence = {
      x: 1 + Math.floor(seeded(`${cellSeed}:river-cx`) * (TILE_PARCEL_COLS - 2)),
      y: 1 + Math.floor(seeded(`${cellSeed}:river-cy`) * (TILE_PARCEL_ROWS - 2)),
    };
    for (const edge of riverEdges) {
      const along = riverCrossing(sessionId, gridX, gridY, edge.dx, edge.dy);
      const entry = borderParcel(edge.dx, edge.dy, along, 0);
      const xFirst = seeded(`${cellSeed}:river-bend:${edge.dx}:${edge.dy}`) < 0.5;
      let { x, y } = entry;
      channel.push({ x, y });
      const stepX = () => { while (x !== confluence.x) { x += x < confluence.x ? 1 : -1; channel.push({ x, y }); } };
      const stepY = () => { while (y !== confluence.y) { y += y < confluence.y ? 1 : -1; channel.push({ x, y }); } };
      if (xFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    }
    for (const cell of channel) water.set(parcelIndexOf(cell.x, cell.y), WATER_DEFS.river_channel);
  }

  // 3) Lakes: small blobs, only where water is plausible (river cell or next to water).
  const lakeChance = terrain.has_river ? 0.45 : waterNeighbours.length > 0 ? 0.3 : 0.06;
  if (seeded(`${cellSeed}:lake`) < lakeChance) {
    const size = 2 + Math.floor(seeded(`${cellSeed}:lake-size`) * 4);
    let anchor = {
      x: Math.floor(seeded(`${cellSeed}:lake-x`) * TILE_PARCEL_COLS),
      y: Math.floor(seeded(`${cellSeed}:lake-y`) * TILE_PARCEL_ROWS),
    };
    // A lake next to the sea or a river grows out of that water body.
    if (channel.length > 0) {
      anchor = channel[Math.floor(seeded(`${cellSeed}:lake-anchor`) * channel.length)];
    } else if (waterNeighbours.length > 0) {
      const seaEdge = waterNeighbours[0];
      const span = seaEdge.dx !== 0 ? TILE_PARCEL_ROWS : TILE_PARCEL_COLS;
      const along = Math.floor(seeded(`${cellSeed}:lake-along`) * span);
      anchor = borderParcel(seaEdge.dx, seaEdge.dy, along, 1);
    }
    const blob: Array<{ x: number; y: number }> = [anchor];
    const taken = new Set([parcelIndexOf(anchor.x, anchor.y)]);
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let guard = 0;
    while (blob.length < size && guard < 24) {
      const from = blob[Math.floor(seeded(`${cellSeed}:lake-grow:${guard}`) * blob.length)];
      const [dx, dy] = steps[Math.floor(seeded(`${cellSeed}:lake-dir:${guard}`) * steps.length)];
      const next = { x: from.x + dx, y: from.y + dy };
      guard += 1;
      if (!insideParcelGrid(next.x, next.y)) continue;
      const index = parcelIndexOf(next.x, next.y);
      if (taken.has(index)) continue;
      taken.add(index);
      blob.push(next);
    }
    for (const cell of blob) {
      const index = parcelIndexOf(cell.x, cell.y);
      if (!water.has(index)) water.set(index, WATER_DEFS.lake);
    }
  }

  // 4) Every land parcel touching water becomes a bank.
  const banks: number[] = [];
  for (const index of water.keys()) {
    const x = index % TILE_PARCEL_COLS;
    const y = Math.floor(index / TILE_PARCEL_COLS);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!insideParcelGrid(nx, ny)) continue;
      const neighbourIndex = parcelIndexOf(nx, ny);
      if (!water.has(neighbourIndex)) banks.push(neighbourIndex);
    }
  }
  for (const index of banks) {
    if (!water.has(index)) water.set(index, WATER_DEFS.river_bank);
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

export const SUB_BIOME_LABELS: Record<string, string> = {
  fertile_flat: "Úrodná rovina",
  grassland: "Pastvina",
  dry_flat: "Suchá rovina",
  hillock: "Pahorek",
  boggy_dip: "Mokřina",
  thicket: "Houština",
  dense_forest: "Hustý les",
  clearing: "Mýtina",
  creek_bank: "Břeh potoka",
  ridge_woods: "Hřebenový les",
  thick_canopy: "Neprostupný prales",
  terrace: "Terasa",
  saddle: "Sedlo",
  steep_slope: "Prudký svah",
  sheltered_hollow: "Chráněná úžlabina",
  crag: "Skalní útes",
  mountain_shelf: "Horská police",
  pass_floor: "Dno průsmyku",
  sand_flat: "Písečná plošina",
  dune: "Duna",
  rocky_patch: "Kamenitá plocha",
  oasis_edge: "Okraj oázy",
  frozen_flat: "Zmrzlá rovina",
  permafrost_rise: "Zvednutý permafrost",
  reed_marsh: "Rákosový močál",
  raised_bank: "Vyvýšený břeh",
  fertile_silt: "Úrodný nános",
  shore: "Pobřeží",
  harbour_flat: "Přístavní rovina",
  cliff_edge: "Okraj útesu",
  river_bank: "Břeh řeky",
  open_water: "Otevřená voda",
  open_ground: "Otevřená plocha",
  shallow_dip: "Mělká pánev",
};

export const SUB_BIOME_COLORS: Record<string, string> = {
  fertile_flat: "hsl(96 42% 42%)",
  grassland: "hsl(92 34% 45%)",
  dry_flat: "hsl(66 30% 48%)",
  hillock: "hsl(84 26% 40%)",
  boggy_dip: "hsl(160 24% 34%)",
  thicket: "hsl(120 28% 33%)",
  dense_forest: "hsl(140 34% 26%)",
  clearing: "hsl(104 36% 47%)",
  creek_bank: "hsl(178 32% 40%)",
  ridge_woods: "hsl(148 28% 31%)",
  thick_canopy: "hsl(150 38% 22%)",
  terrace: "hsl(70 26% 44%)",
  saddle: "hsl(78 24% 47%)",
  steep_slope: "hsl(34 18% 44%)",
  sheltered_hollow: "hsl(98 30% 43%)",
  crag: "hsl(28 12% 52%)",
  mountain_shelf: "hsl(30 14% 47%)",
  pass_floor: "hsl(44 18% 50%)",
  sand_flat: "hsl(44 46% 62%)",
  dune: "hsl(40 52% 68%)",
  rocky_patch: "hsl(26 14% 50%)",
  oasis_edge: "hsl(120 40% 46%)",
  frozen_flat: "hsl(198 22% 68%)",
  permafrost_rise: "hsl(204 18% 60%)",
  reed_marsh: "hsl(150 26% 36%)",
  raised_bank: "hsl(84 22% 44%)",
  fertile_silt: "hsl(100 34% 44%)",
  shore: "hsl(46 42% 66%)",
  harbour_flat: "hsl(50 34% 60%)",
  cliff_edge: "hsl(28 16% 46%)",
  river_bank: "hsl(190 40% 46%)",
  open_water: "hsl(192 58% 40%)",
  open_ground: "hsl(88 28% 46%)",
  shallow_dip: "hsl(96 26% 41%)",
};

export function subBiomeLabel(key: string): string {
  return SUB_BIOME_LABELS[key] || key;
}

export function subBiomeColor(key: string): string {
  return SUB_BIOME_COLORS[key] || "hsl(88 24% 44%)";
}

/** How many of the 36 sub-parcels an army physically camps on. */
export function armyParcelFootprint(soldiers: number): number {
  const men = Math.max(0, soldiers);
  if (men < 600) return 1;
  if (men < 1500) return 2;
  if (men < 3000) return 4;
  if (men < 6000) return 6;
  return 9;
}

/**
 * Deterministic camp block inside the 6x6 parcel grid.
 * Movement stays on the main square grid — this only says where inside the cell the tents stand.
 */
export function armyCampParcels(anchorIndex: number, footprint: number): number[] {
  const width = footprint >= 9 ? 3 : footprint >= 4 ? 2 : footprint;
  const height = Math.ceil(footprint / width);
  const ax = Math.min(TILE_PARCEL_COLS - width, Math.max(0, anchorIndex % TILE_PARCEL_COLS));
  const ay = Math.min(TILE_PARCEL_ROWS - height, Math.max(0, Math.floor(anchorIndex / TILE_PARCEL_COLS)));
  const cells: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width && cells.length < footprint; x += 1) {
      cells.push((ay + y) * TILE_PARCEL_COLS + (ax + x));
    }
  }
  return cells;
}

/** Stable fallback parcel when the army has no stored camp parcel yet. */
export function fallbackArmyParcel(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return hash % TILE_PARCEL_COUNT;
}
