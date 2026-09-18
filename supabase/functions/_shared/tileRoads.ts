import {
  TILE_PARCEL_COLS,
  TILE_PARCEL_ROWS,
  riverChannelCells,
  seeded,
  type NeighbourTerrain,
  type TileTerrain,
} from "./tileParcels.ts";

export type RoadCell = { x: number; y: number };
export type RoadStep = { dx: number; dy: number };
export type SubRoadCell = { gridX: number; gridY: number; parcelX: number; parcelY: number };

export const CARDINAL_STEPS: RoadStep[] = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
];

/** Extra cost of carrying a road over one water sub-parcel (a bridge). */
export const BRIDGE_COST = { gold: 45, production: 30 };

export const subRoadGlobal = (cell: SubRoadCell): RoadCell => ({
  x: cell.gridX * TILE_PARCEL_COLS + cell.parcelX,
  y: cell.gridY * TILE_PARCEL_ROWS + cell.parcelY,
});

export const areSubRoadNeighbours = (left: SubRoadCell, right: SubRoadCell) => {
  const a = subRoadGlobal(left); const b = subRoadGlobal(right);
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
};

/** Macro transport path derived from a precise sub-parcel trace. */
export function macroPathFromSubRoad(path: SubRoadCell[]): RoadCell[] {
  const result: RoadCell[] = [];
  path.forEach(cell => {
    const previous = result[result.length - 1];
    if (!previous || previous.x !== cell.gridX || previous.y !== cell.gridY) result.push({ x: cell.gridX, y: cell.gridY });
  });
  return result;
}

const parcelIndexOf = (x: number, y: number) => y * TILE_PARCEL_COLS + x;

/** Where a road crosses the border between two cells — symmetric, so both sides line up. */
function roadCrossing(sessionId: string, gridX: number, gridY: number, step: RoadStep): number {
  const first = `${gridX},${gridY}`;
  const second = `${gridX + step.dx},${gridY + step.dy}`;
  const key = first < second ? `${first}|${second}` : `${second}|${first}`;
  const span = Math.max(1, (step.dx !== 0 ? TILE_PARCEL_ROWS : TILE_PARCEL_COLS) - 2);
  return 1 + Math.floor(seeded(`${sessionId}:road-edge:${key}`) * span);
}

function borderParcel(step: RoadStep, along: number): RoadCell {
  if (step.dx > 0) return { x: TILE_PARCEL_COLS - 1, y: along };
  if (step.dx < 0) return { x: 0, y: along };
  if (step.dy > 0) return { x: along, y: TILE_PARCEL_ROWS - 1 };
  return { x: along, y: 0 };
}

/** The cell's road junction — roads always meet in the middle of the sub-parcel grid. */
export function roadJunction(sessionId: string, gridX: number, gridY: number): RoadCell {
  return {
    x: 2 + Math.floor(seeded(`${sessionId}:road-cx:${gridX}:${gridY}`) * 2),
    y: 2 + Math.floor(seeded(`${sessionId}:road-cy:${gridX}:${gridY}`) * 2),
  };
}

/**
 * Deterministic road trace inside one macro cell: one branch per connected neighbour,
 * each running from the shared border parcel to the cell's junction. Same shape is used by
 * the sub-parcel layer, the macro map and the server cost model.
 */
export function tileRoadBranches(
  sessionId: string, gridX: number, gridY: number, steps: RoadStep[],
): RoadCell[][] {
  const junction = roadJunction(sessionId, gridX, gridY);
  const unique = steps.filter((step, index, all) =>
    all.findIndex(item => item.dx === step.dx && item.dy === step.dy) === index);
  if (!unique.length) return [[junction]];
  return unique.map(step => {
    const path: RoadCell[] = [];
    let { x, y } = borderParcel(step, roadCrossing(sessionId, gridX, gridY, step));
    path.push({ x, y });
    let axis = seeded(`${sessionId}:road-step:${gridX}:${gridY}:${step.dx}:${step.dy}`) < 0.5;
    while (x !== junction.x || y !== junction.y) {
      const canX = x !== junction.x;
      const canY = y !== junction.y;
      if ((axis && canX) || !canY) x += x < junction.x ? 1 : -1;
      else y += y < junction.y ? 1 : -1;
      path.push({ x, y });
      axis = !axis;
    }
    return path;
  });
}

/** Flat, de-duplicated road footprint of one cell. */
export function tileRoadCells(
  sessionId: string, gridX: number, gridY: number, steps: RoadStep[],
): RoadCell[] {
  const seen = new Map<number, RoadCell>();
  tileRoadBranches(sessionId, gridX, gridY, steps)
    .flat()
    .forEach(cell => seen.set(parcelIndexOf(cell.x, cell.y), cell));
  return [...seen.values()];
}

/** Sub-parcels where the road has to bridge the river channel. */
export function tileBridgeCells(
  sessionId: string, gridX: number, gridY: number, steps: RoadStep[],
  terrain: TileTerrain, neighbours: NeighbourTerrain[],
): RoadCell[] {
  const river = new Set(
    riverChannelCells(sessionId, gridX, gridY, terrain, neighbours).map(cell => parcelIndexOf(cell.x, cell.y)),
  );
  return tileRoadCells(sessionId, gridX, gridY, steps).filter(cell => river.has(parcelIndexOf(cell.x, cell.y)));
}

/** Road project cost: the tier price plus one bridge surcharge per crossed river sub-parcel. */
export function tileRoadCost(base: { gold: number; production: number }, bridges: number) {
  return {
    gold: base.gold + bridges * BRIDGE_COST.gold,
    production: base.production + bridges * BRIDGE_COST.production,
    bridges,
  };
}

/** Global sub-parcel coordinates back to the macro cell + parcel pair. */
export function globalToSubRoad(x: number, y: number): SubRoadCell {
  const floorDiv = (value: number, span: number) => Math.floor(value / span);
  const mod = (value: number, span: number) => ((value % span) + span) % span;
  return {
    gridX: floorDiv(x, TILE_PARCEL_COLS), gridY: floorDiv(y, TILE_PARCEL_ROWS),
    parcelX: mod(x, TILE_PARCEL_COLS), parcelY: mod(y, TILE_PARCEL_ROWS),
  };
}

/**
 * Straight-ish sub-parcel walk between two cells (exclusive of `from`, inclusive of `to`).
 * Lets the player click or drag over gaps — the trace stays cardinal and continuous.
 */
export function subRoadPathBetween(from: SubRoadCell, to: SubRoadCell): SubRoadCell[] {
  const start = subRoadGlobal(from); const end = subRoadGlobal(to);
  const path: SubRoadCell[] = [];
  let { x, y } = start;
  let axis = Math.abs(end.x - x) >= Math.abs(end.y - y);
  let guard = 0;
  while ((x !== end.x || y !== end.y) && guard++ < 512) {
    const canX = x !== end.x; const canY = y !== end.y;
    if ((axis && canX) || !canY) x += x < end.x ? 1 : -1;
    else y += y < end.y ? 1 : -1;
    path.push(globalToSubRoad(x, y));
    axis = !axis;
  }
  return path;
}

/**
 * Shortest passable sub-parcel detour between two cells (exclusive of `from`,
 * inclusive of `to`). Returns null when nothing walkable connects them nearby.
 */
export function subRoadDetour(
  from: SubRoadCell, to: SubRoadCell, passable: (cell: SubRoadCell) => boolean, budget = 20000,
): SubRoadCell[] | null {
  const start = subRoadGlobal(from); const goal = subRoadGlobal(to);
  const startKey = `${start.x},${start.y}`; const goalKey = `${goal.x},${goal.y}`;
  const previous = new Map<string, string | null>([[startKey, null]]);
  const queue: RoadCell[] = [start];
  let visited = 0;
  while (queue.length && visited++ < budget) {
    const cell = queue.shift()!;
    const key = `${cell.x},${cell.y}`;
    if (key === goalKey) break;
    for (const step of CARDINAL_STEPS) {
      const nextCell = { x: cell.x + step.dx, y: cell.y + step.dy };
      const nextKey = `${nextCell.x},${nextCell.y}`;
      if (previous.has(nextKey)) continue;
      if (nextKey !== goalKey && !passable(globalToSubRoad(nextCell.x, nextCell.y))) continue;
      previous.set(nextKey, key);
      queue.push(nextCell);
    }
  }
  if (!previous.has(goalKey)) return null;
  const path: SubRoadCell[] = [];
  let cursor: string | null = goalKey;
  while (cursor && cursor !== startKey) {
    const [x, y] = cursor.split(",").map(Number);
    path.push(globalToSubRoad(x, y));
    cursor = previous.get(cursor) ?? null;
  }
  return path.reverse();
}
