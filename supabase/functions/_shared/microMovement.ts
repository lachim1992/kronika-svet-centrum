// Micro-square army movement (6x6 sub-squares per macro square).
// Pure and deterministic; shared by command-dispatch (server authority) and the map UI (preview).
// Global micro coordinate: mx = grid_x * 6 + parcel_x, my = grid_y * 6 + parcel_y.

export const MICRO_PER_TILE = 6;
/** Movement points per turn, in tenths (100 = 10 road steps). */
export const MOVE_BUDGET = 100;
/** Maximum soldiers standing on one micro square. */
export const MAX_MEN_PER_MICRO = 500;

export type Micro = { x: number; y: number };
export type MicroTerrain = { subBiome?: string | null; macroBiome?: string | null; road?: boolean; macroPassable?: boolean | null };

export const ROAD_COST = 10;
const COST_BY_SUB_BIOME: Record<string, number> = {
  grassland: 15, fertile_flat: 15, clearing: 15, harbour_flat: 15, shore: 15, frozen_flat: 15, terrace: 15,
  fertile_silt: 15, sand_flat: 15, raised_bank: 15, creek_bank: 15, sheltered_hollow: 15,
  hillock: 20, dense_forest: 20, ridge_woods: 20, dune: 20, saddle: 20, permafrost_rise: 20,
  steep_slope: 30, cliff_edge: 30, boggy_dip: 30, reed_marsh: 30,
};
const IMPASSABLE_SUB = new Set(["open_water", "river_channel"]);
const COST_BY_MACRO: Record<string, number> = {
  plains: 15, grassland: 15, steppe: 15, desert: 20, tundra: 20, forest: 20, hills: 20,
  swamp: 30, mountains: 30, mountain: 30,
};

export function microOf(gridX: number, gridY: number, parcelIndex: number): Micro {
  return { x: gridX * MICRO_PER_TILE + (parcelIndex % MICRO_PER_TILE), y: gridY * MICRO_PER_TILE + Math.floor(parcelIndex / MICRO_PER_TILE) };
}
export function tileOfMicro(m: Micro): { gridX: number; gridY: number; parcelIndex: number } {
  const gridX = Math.floor(m.x / MICRO_PER_TILE), gridY = Math.floor(m.y / MICRO_PER_TILE);
  const px = m.x - gridX * MICRO_PER_TILE, py = m.y - gridY * MICRO_PER_TILE;
  return { gridX, gridY, parcelIndex: py * MICRO_PER_TILE + px };
}
export const microKey = (m: Micro) => `${m.x},${m.y}`;

/** Movement cost (tenths) to enter a micro square; null = impassable. Roads (incl. bridges) always cost ROAD_COST. */
export function microEntryCost(t: MicroTerrain | undefined): number | null {
  if (!t) return null;
  if (t.road) return ROAD_COST;
  if (t.macroPassable === false || t.macroBiome === "sea") return null;
  if (t.subBiome) {
    if (IMPASSABLE_SUB.has(t.subBiome)) return null;
    return COST_BY_SUB_BIOME[t.subBiome] ?? 15;
  }
  return COST_BY_MACRO[t.macroBiome ?? ""] ?? 15;
}

/** How many micro squares an army occupies visually (it still moves as one). */
export function microFootprint(soldiers: number): number {
  return Math.max(1, Math.min(MICRO_PER_TILE * MICRO_PER_TILE, Math.ceil(Math.max(0, soldiers) / MAX_MEN_PER_MICRO)));
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export type MicroPathCheck =
  | { ok: true; spent: number; steps: number }
  | { ok: false; reason: "too_short" | "not_adjacent" | "impassable" | "over_budget"; at: number };

/** Server authority: a path must be 4-adjacent, passable and within budget. */
export function validateMicroPath(path: Micro[], terrainAt: (m: Micro) => MicroTerrain | undefined, budget = MOVE_BUDGET): MicroPathCheck {
  if (!Array.isArray(path) || path.length < 2) return { ok: false, reason: "too_short", at: 0 };
  let spent = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1], b = path[i];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) return { ok: false, reason: "not_adjacent", at: i };
    const cost = microEntryCost(terrainAt(b));
    if (cost === null) return { ok: false, reason: "impassable", at: i };
    spent += cost;
    if (spent > budget) return { ok: false, reason: "over_budget", at: i };
  }
  return { ok: true, spent, steps: path.length - 1 };
}

/**
 * Cheapest path toward `target` (Dijkstra, bounded to the budget). If the target is beyond reach,
 * returns the path to the reachable square closest to the target. Never exceeds the budget.
 */
export function planMicroPath(start: Micro, target: Micro, terrainAt: (m: Micro) => MicroTerrain | undefined, budget = MOVE_BUDGET): { path: Micro[]; spent: number; reachedTarget: boolean } {
  const dist = new Map<string, number>([[microKey(start), 0]]);
  const prev = new Map<string, Micro>();
  const open: Array<{ m: Micro; d: number }> = [{ m: start, d: 0 }];
  let best = start, bestH = Math.abs(start.x - target.x) + Math.abs(start.y - target.y), bestD = 0;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].d < open[bi].d) bi = i;
    const { m, d } = open.splice(bi, 1)[0];
    if (d > (dist.get(microKey(m)) ?? Infinity)) continue;
    const h = Math.abs(m.x - target.x) + Math.abs(m.y - target.y);
    if (h < bestH || (h === bestH && d < bestD)) { best = m; bestH = h; bestD = d; }
    if (h === 0) break;
    for (const [dx, dy] of DIRS) {
      const n = { x: m.x + dx, y: m.y + dy };
      const c = microEntryCost(terrainAt(n));
      if (c === null) continue;
      const nd = d + c;
      if (nd > budget) continue;
      const k = microKey(n);
      if (nd < (dist.get(k) ?? Infinity)) { dist.set(k, nd); prev.set(k, m); open.push({ m: n, d: nd }); }
    }
  }
  const path: Micro[] = [best];
  let cur = best;
  while (microKey(cur) !== microKey(start)) { cur = prev.get(microKey(cur))!; path.unshift(cur); }
  return { path, spent: bestD, reachedTarget: bestH === 0 };
}
